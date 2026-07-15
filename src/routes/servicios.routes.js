const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/servicios — PÚBLICO (para mostrar horarios en la página)
router.get('/', async (req, res) => {
  try {
    const servicios = await prisma.servicio.findMany({
      where: { activo: true },
      include: { imagenes: { orderBy: { orden: 'asc' } } },
      orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    });
    res.json(servicios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar servicios.' });
  }
});

// POST /api/servicios — solo ADMIN/PASTOR
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'PASTOR'),
  [body('nombre').notEmpty(), body('diaSemana').notEmpty(), body('horaInicio').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }
    const { imagenes, ...datos } = req.body;
    try {
      const servicio = await prisma.servicio.create({
        data: {
          ...datos,
          imagenes: imagenes?.length
            ? { create: imagenes.map((url, i) => ({ url, orden: i })) }
            : undefined,
        },
        include: { imagenes: true },
      });
      res.status(201).json(servicio);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear servicio.' });
    }
  }
);

// PUT /api/servicios/:id — reemplaza también la galería si se envía "imagenes"
router.put('/:id', requireAuth, requireRole('ADMIN', 'PASTOR'), async (req, res) => {
  const { imagenes, ...datos } = req.body;
  try {
    if (imagenes) {
      await prisma.servicioImagen.deleteMany({ where: { servicioId: Number(req.params.id) } });
    }
    const servicio = await prisma.servicio.update({
      where: { id: Number(req.params.id) },
      data: {
        ...datos,
        imagenes: imagenes?.length
          ? { create: imagenes.map((url, i) => ({ url, orden: i })) }
          : undefined,
      },
      include: { imagenes: { orderBy: { orden: 'asc' } } },
    });
    res.json(servicio);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar servicio.' });
  }
});

// DELETE /api/servicios/:id
router.delete('/:id', requireAuth, requireRole('ADMIN', 'PASTOR'), async (req, res) => {
  try {
    await prisma.servicio.update({
      where: { id: Number(req.params.id) },
      data: { activo: false },
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar servicio.' });
  }
});

module.exports = router;
