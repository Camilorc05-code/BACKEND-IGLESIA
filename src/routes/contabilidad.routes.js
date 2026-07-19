const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registrarAuditoria } = require('../lib/audit');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(requireAuth);

// GET /api/contabilidad — listar movimientos con filtros
router.get('/', async (req, res) => {
  const { tipo, desde, hasta, personaId, page = 1, limit = 50 } = req.query;
  const where = {};
  if (tipo) where.tipo = tipo;
  if (personaId) where.personaId = Number(personaId);
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta + 'T23:59:59');
  }
  try {
    const [movimientos, total] = await Promise.all([
      prisma.movimientoContable.findMany({
        where,
        include: { persona: { select: { id: true, nombres: true, apellidos: true } } },
        orderBy: { fecha: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.movimientoContable.count({ where }),
    ]);
    res.json({ movimientos, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener movimientos.' });
  }
});

// GET /api/contabilidad/resumen — resumen del mes actual
router.get('/resumen', async (req, res) => {
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
  const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  try {
    const [diezmos, ofrendas, donaciones, gastos] = await Promise.all([
      prisma.movimientoContable.aggregate({ where: { tipo: 'diezmo', fecha: { gte: inicioMes, lte: finMes } }, _sum: { monto: true }, _count: true }),
      prisma.movimientoContable.aggregate({ where: { tipo: 'ofrenda', fecha: { gte: inicioMes, lte: finMes } }, _sum: { monto: true }, _count: true }),
      prisma.movimientoContable.aggregate({ where: { tipo: 'donacion', fecha: { gte: inicioMes, lte: finMes } }, _sum: { monto: true }, _count: true }),
      prisma.movimientoContable.aggregate({ where: { tipo: 'gasto', fecha: { gte: inicioMes, lte: finMes } }, _sum: { monto: true }, _count: true }),
    ]);
    const totalEntradas = (diezmos._sum.monto || 0) + (ofrendas._sum.monto || 0) + (donaciones._sum.monto || 0);
    const totalGastos = gastos._sum.monto || 0;
    res.json({
      mes: now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
      diezmos: { total: diezmos._sum.monto || 0, cantidad: diezmos._count },
      ofrendas: { total: ofrendas._sum.monto || 0, cantidad: ofrendas._count },
      donaciones: { total: donaciones._sum.monto || 0, cantidad: donaciones._count },
      gastos: { total: totalGastos, cantidad: gastos._count },
      balance: totalEntradas - totalGastos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener resumen.' });
  }
});

// POST /api/contabilidad — registrar movimiento
router.post('/', [body('tipo').isIn(['diezmo', 'ofrenda', 'donacion', 'gasto']), body('monto').isFloat({ gt: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });

  const { tipo, monto, personaId, nombreAnonimo, descripcion, metodoPago, notas, fecha } = req.body;
  try {
    const movimiento = await prisma.movimientoContable.create({
      data: {
        tipo,
        monto: Number(monto),
        personaId: personaId ? Number(personaId) : undefined,
        nombreAnonimo,
        descripcion,
        metodoPago,
        notas,
        registradoPor: req.usuario?.id,
        fecha: fecha ? new Date(fecha) : new Date(),
      },
      include: { persona: { select: { id: true, nombres: true, apellidos: true } } },
    });
    registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'CREATE', entidad: 'MovimientoContable', entidadId: movimiento.id, detalle: `${tipo} $${monto}` });
    res.status(201).json(movimiento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar movimiento.' });
  }
});

// DELETE /api/contabilidad/:id — eliminar movimiento (solo ADMIN)
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    await prisma.movimientoContable.delete({ where: { id: Number(req.params.id) } });
    registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'DELETE', entidad: 'MovimientoContable', entidadId: Number(req.params.id) });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar movimiento.' });
  }
});

module.exports = router;
