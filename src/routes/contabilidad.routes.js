const express = require('express');
const { body, validationResult } = require('express-validator');
const ExcelJS = require('exceljs');
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

// GET /api/contabilidad/resumen — resumen del mes (acepta ?mes=7&anio=2026)
router.get('/resumen', async (req, res) => {
  const now = new Date();
  const mes = req.query.mes ? Number(req.query.mes) - 1 : now.getMonth();
  const anio = req.query.anio ? Number(req.query.anio) : now.getFullYear();
  const inicioMes = new Date(anio, mes, 1);
  const finMes = new Date(anio, mes + 1, 0, 23, 59, 59);
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
      mes: inicioMes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
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

// PUT /api/contabilidad/:id — editar movimiento
router.put('/:id', [body('tipo').isIn(['diezmo', 'ofrenda', 'donacion', 'gasto']), body('monto').isFloat({ gt: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
  const { tipo, monto, personaId, nombreAnonimo, descripcion, metodoPago, notas, fecha } = req.body;
  try {
    const existente = await prisma.movimientoContable.findUnique({ where: { id: Number(req.params.id) } });
    if (!existente) return res.status(404).json({ error: 'Movimiento no encontrado.' });
    const movimiento = await prisma.movimientoContable.update({
      where: { id: Number(req.params.id) },
      data: {
        tipo,
        monto: Number(monto),
        personaId: personaId ? Number(personaId) : null,
        nombreAnonimo,
        descripcion,
        metodoPago,
        notas,
        fecha: fecha ? new Date(fecha) : existente.fecha,
      },
      include: { persona: { select: { id: true, nombres: true, apellidos: true } } },
    });
    registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'UPDATE', entidad: 'MovimientoContable', entidadId: movimiento.id, detalle: `Editado ${tipo} $${monto}` });
    res.json(movimiento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar movimiento.' });
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

// GET /api/contabilidad/excel?mes=7&anio=2026 — descargar Excel del mes
router.get('/excel', async (req, res) => {
  const now = new Date();
  const mes = req.query.mes ? Number(req.query.mes) : now.getMonth() + 1;
  const anio = req.query.anio ? Number(req.query.anio) : now.getFullYear();
  const inicioMes = new Date(anio, mes - 1, 1);
  const finMes = new Date(anio, mes, 0, 23, 59, 59);
  const nombreMes = inicioMes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  try {
    const movimientos = await prisma.movimientoContable.findMany({
      where: { fecha: { gte: inicioMes, lte: finMes } },
      include: { persona: { select: { id: true, nombres: true, apellidos: true, numeroDocumento: true } } },
      orderBy: { fecha: 'asc' },
    });
    const labels = { diezmo: 'Diezmo', ofrenda: 'Ofrenda', donacion: 'Donación', gasto: 'Gasto' };
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Misión Panamericana';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(`Contabilidad ${nombreMes}`);
    // Título
    sheet.mergeCells('A1:H1');
    const titulo = sheet.getCell('A1');
    titulo.value = `Centro de Fe y Esperanza — Misión Panamericana`;
    titulo.font = { size: 14, bold: true, color: { argb: 'FF024293' } };
    titulo.alignment = { horizontal: 'center' };
    // Subtítulo
    sheet.mergeCells('A2:H2');
    const sub = sheet.getCell('A2');
    sub.value = `Resumen Contable — ${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}`;
    sub.font = { size: 11, italic: true, color: { argb: 'FF666666' } };
    sub.alignment = { horizontal: 'center' };
    // Encabezados
    const headers = ['#', 'Fecha', 'Tipo', 'Monto', 'Persona', 'Cédula', 'Método Pago', 'Descripción'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF024293' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF024293' } } };
    });
    // Datos
    let totalEntradas = 0;
    let totalGastos = 0;
    movimientos.forEach((m, i) => {
      const nombre = m.persona ? `${m.persona.nombres} ${m.persona.apellidos}` : m.nombreAnonimo || 'Anónimo';
      const row = sheet.addRow([
        i + 1,
        m.fecha.toLocaleDateString('es-CO'),
        labels[m.tipo] || m.tipo,
        m.monto,
        nombre,
        m.persona?.numeroDocumento || '—',
        m.metodoPago || '—',
        m.descripcion || '',
      ]);
      // Color de fila según tipo
      const color = m.tipo === 'gasto' ? 'FFFCE4EC' : 'FFE8F5E9';
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
        cell.alignment = { vertical: 'middle' };
      });
      // Formato moneda en columna monto
      row.getCell(4).numFmt = '#,##0';
      if (m.tipo === 'gasto') totalGastos += m.monto;
      else totalEntradas += m.monto;
    });
    // Fila de totales
    sheet.addRow([]);
    const totRow = sheet.addRow(['', '', 'TOTAL ENTRADAS', totalEntradas, '', '', '', '']);
    totRow.getCell(3).font = { bold: true };
    totRow.getCell(4).numFmt = '#,##0';
    totRow.getCell(4).font = { bold: true, color: { argb: 'FF16A34A' } };
    const gastRow = sheet.addRow(['', '', 'TOTAL GASTOS', totalGastos, '', '', '', '']);
    gastRow.getCell(3).font = { bold: true };
    gastRow.getCell(4).numFmt = '#,##0';
    gastRow.getCell(4).font = { bold: true, color: { argb: 'FFDC2626' } };
    const balRow = sheet.addRow(['', '', 'BALANCE', totalEntradas - totalGastos, '', '', '', '']);
    balRow.getCell(3).font = { bold: true, size: 12 };
    balRow.getCell(4).numFmt = '#,##0';
    balRow.getCell(4).font = { bold: true, size: 12, color: { argb: totalEntradas - totalGastos >= 0 ? 'FF16A34A' : 'FFDC2626' } };
    // Ancho de columnas
    sheet.columns = [
      { width: 5 }, { width: 14 }, { width: 14 }, { width: 16 },
      { width: 28 }, { width: 16 }, { width: 16 }, { width: 30 },
    ];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=contabilidad-${nombreMes.replace(/\s+/g, '-')}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar Excel.' });
  }
});

module.exports = router;
