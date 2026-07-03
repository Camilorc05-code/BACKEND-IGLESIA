const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

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
  'Otro',
];

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

// POST /api/eventos — solo ADMIN/PASTOR/LIDER
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'PASTOR', 'LIDER'),
  [body('titulo').notEmpty(), body('fecha').isISO8601()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }
    const { imagenes, ...datos } = req.body;
    try {
      const evento = await prisma.evento.create({
        data: {
          ...datos,
          imagenes: imagenes?.length
            ? { create: imagenes.map((url, i) => ({ url, orden: i })) }
            : undefined,
        },
        include: { imagenes: true },
      });
      res.status(201).json(evento);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear evento.' });
    }
  }
);

// PUT /api/eventos/:id — reemplaza también la galería si se envía "imagenes"
router.put('/:id', requireAuth, requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  const { imagenes, ...datos } = req.body;
  try {
    if (imagenes) {
      await prisma.eventoImagen.deleteMany({ where: { eventoId: Number(req.params.id) } });
    }
    const evento = await prisma.evento.update({
      where: { id: Number(req.params.id) },
      data: {
        ...datos,
        imagenes: imagenes?.length
          ? { create: imagenes.map((url, i) => ({ url, orden: i })) }
          : undefined,
      },
      include: { imagenes: { orderBy: { orden: 'asc' } } },
    });
    res.json(evento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar evento.' });
  }
});

// DELETE /api/eventos/:id
router.delete('/:id', requireAuth, requireRole('ADMIN', 'PASTOR'), async (req, res) => {
  try {
    await prisma.evento.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar evento.' });
  }
});

module.exports = router;