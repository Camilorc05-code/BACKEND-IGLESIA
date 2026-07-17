const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notificaciones — listar notificaciones (últimas 50)
router.get('/', requireAuth, async (req, res) => {
  try {
    const notificaciones = await prisma.notificacion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notificaciones);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener notificaciones.' });
  }
});

// GET /api/notificaciones/no-leidas — contar no leídas
router.get('/no-leidas', requireAuth, async (req, res) => {
  try {
    const count = await prisma.notificacion.count({ where: { leida: false } });
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al contar notificaciones.' });
  }
});

// PUT /api/notificaciones/:id/leer — marcar como leída
router.put('/:id/leer', requireAuth, async (req, res) => {
  try {
    await prisma.notificacion.update({
      where: { id: Number(req.params.id) },
      data: { leida: true },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al marcar notificación.' });
  }
});

// PUT /api/notificaciones/leer-todas — marcar todas como leídas
router.put('/leer-todas', requireAuth, async (req, res) => {
  try {
    await prisma.notificacion.updateMany({ data: { leida: true } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al marcar notificaciones.' });
  }
});

// DELETE /api/notificaciones/:id — eliminar una
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.notificacion.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar notificación.' });
  }
});

// POST /api/notificaciones — crear notificación (para uso manual o futuro)
router.post('/', requireAuth, async (req, res) => {
  const { tipo, titulo, mensaje } = req.body;
  if (!tipo || !titulo || !mensaje) {
    return res.status(400).json({ error: 'tipo, titulo y mensaje son requeridos.' });
  }
  try {
    const notif = await prisma.notificacion.create({ data: { tipo, titulo, mensaje } });
    res.status(201).json(notif);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear notificación.' });
  }
});

module.exports = router;
