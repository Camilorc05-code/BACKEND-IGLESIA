const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registrarAuditoria } = require('../lib/audit');

const router = express.Router();

// Categorías sugeridas — el frontend las usa para agrupar la galería
const CATEGORIAS = [
  'Cumbre Ministerial',
  'Fiesta de Primicias',
  'Juntos Bajo la Bendición de Dios',
  'Acción de Gracias',
  'Ministerio M.I.A',
  'Ministerio M.J.P',
  'Vigilia',
  'Día del Padre',
  'Día de la Madre',
  'Día del Hombre',
  'Día de la Mujer',
  'Otro',
];

/**
 * Convierte una fecha "YYYY-MM-DD" (del input type="date") a ISO DateTime completo.
 * Usa UTC-5 (hora Colombia) para que la fecha se muestre correctamente.
 */
function normalizarFecha(fecha) {
  if (!fecha) return fecha;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return new Date(fecha + 'T05:00:00.000Z').toISOString();
  }
  return fecha;
}

// GET /api/eventos/categorias — PÚBLICO
router.get('/categorias', (req, res) => res.json(CATEGORIAS));

// GET /api/eventos?tipo=proximos|pasados&categoria=... — PÚBLICO
router.get('/', async (req, res) => {
  const { tipo, categoria } = req.query;
  const ahora = new Date();

  const where = {
    ...(tipo === 'proximos' ? { fecha: { gte: ahora } } : {}),
    ...(tipo === 'pasados' ? { fecha: { lt: ahora } } : {}),
    ...(categoria ? { categoria } : {}),
  };

  try {
    const eventos = await prisma.evento.findMany({
      where,
      include: { imagenes: { orderBy: { orden: 'asc' } } },
      orderBy: { fecha: tipo === 'pasados' ? 'desc' : 'asc' },
    });
    res.json(eventos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar eventos.' });
  }
});

// GET /api/eventos/:id — PÚBLICO
router.get('/:id', async (req, res) => {
  try {
    const evento = await prisma.evento.findUnique({
      where: { id: Number(req.params.id) },
      include: { imagenes: { orderBy: { orden: 'asc' } } },
    });
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado.' });
    res.json(evento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener evento.' });
  }
});

// POST /api/eventos — solo ADMIN
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  [body('titulo').notEmpty(), body('fecha').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }
    const { imagenes, fecha, ...datos } = req.body;
    try {
      const imagenesCreate = imagenes?.length
        ? { create: imagenes.map((img) => ({
            url: typeof img === 'string' ? img : img.url,
            orden: typeof img === 'string' ? 0 : (img.orden ?? 0),
            position: typeof img === 'string' ? '50% 50%' : (img.position || '50% 50%'),
          })) }
        : undefined;

      const evento = await prisma.evento.create({
        data: {
          ...datos,
          fecha: normalizarFecha(fecha),
          imagenes: imagenesCreate,
        },
        include: { imagenes: true,
          _count: { select: { imagenes: true } }
        },
      });
      registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'CREATE', entidad: 'Evento', entidadId: evento.id, detalle: evento.titulo });
      res.status(201).json(evento);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear evento.' });
    }
  }
);

// PUT /api/eventos/:id — reemplaza también la galería si se envía "imagenes"
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { imagenes, fecha, ...datos } = req.body;
  try {
    if (imagenes) {
      await prisma.eventoImagen.deleteMany({ where: { eventoId: Number(req.params.id) } });
    }
    const imagenesCreate = imagenes?.length
      ? { create: imagenes.map((img) => ({
          url: typeof img === 'string' ? img : img.url,
          orden: typeof img === 'string' ? 0 : (img.orden ?? 0),
          position: typeof img === 'string' ? '50% 50%' : (img.position || '50% 50%'),
        })) }
      : undefined;

    const updateData = {
      ...datos,
      fecha: normalizarFecha(fecha),
      imagenes: imagenesCreate,
    };
    const evento = await prisma.evento.update({
      where: { id: Number(req.params.id) },
      data: updateData,
      include: { imagenes: { orderBy: { orden: 'asc' } } },
    });
    registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'UPDATE', entidad: 'Evento', entidadId: evento.id, detalle: evento.titulo });
    res.json(evento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar evento.' });
  }
});

// DELETE /api/eventos/:id — solo ADMIN
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    await prisma.evento.delete({ where: { id: Number(req.params.id) } });
    registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'DELETE', entidad: 'Evento', entidadId: Number(req.params.id) });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar evento.' });
  }
});

module.exports = router;
