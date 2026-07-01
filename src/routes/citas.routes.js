const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Evita spam en el formulario público de citas: máx 5 solicitudes cada 15 min por IP
const limiterCitasPublicas = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
});

// GET /api/citas/pastores-disponibles — PÚBLICO (lista de pastores para el formulario)
router.get('/pastores-disponibles', async (req, res) => {
  try {
    const pastores = await prisma.usuario.findMany({
      where: { rol: { in: ['PASTOR', 'ADMIN'] }, activo: true },
      select: { id: true, nombre: true },
    });
    res.json(pastores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pastores.' });
  }
});

// POST /api/citas — PÚBLICO: cualquier visitante puede agendar una cita
router.post(
  '/',
  limiterCitasPublicas,
  [
    body('nombreSolicitante').notEmpty(),
    body('telefonoSolicitante').notEmpty(),
    body('pastorId').isInt(),
    body('fecha').isISO8601(),
    body('hora').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const {
      nombreSolicitante,
      telefonoSolicitante,
      emailSolicitante,
      pastorId,
      fecha,
      hora,
      motivo,
      personaId,
    } = req.body;

    try {
      // Evitar doble reserva: mismo pastor, misma fecha y hora, que no esté cancelada
      const ocupado = await prisma.cita.findFirst({
        where: {
          pastorId: Number(pastorId),
          fecha: new Date(fecha),
          hora,
          estado: { not: 'CANCELADA' },
        },
      });
      if (ocupado) {
        return res.status(409).json({ error: 'Ese horario ya está reservado. Elige otro.' });
      }

      const cita = await prisma.cita.create({
        data: {
          nombreSolicitante,
          telefonoSolicitante,
          emailSolicitante,
          pastorId: Number(pastorId),
          fecha: new Date(fecha),
          hora,
          motivo,
          personaId: personaId ? Number(personaId) : undefined,
        },
      });

      res.status(201).json({
        mensaje: 'Cita solicitada correctamente. Te contactaremos para confirmar.',
        cita,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al solicitar la cita.' });
    }
  }
);

// A partir de aquí, todo requiere estar autenticado (equipo pastoral)
router.use(requireAuth);

// GET /api/citas?estado=&pastorId=&desde=&hasta=
router.get('/', async (req, res) => {
  const { estado, pastorId, desde, hasta } = req.query;

  const where = {
    ...(estado ? { estado } : {}),
    ...(pastorId ? { pastorId: Number(pastorId) } : {}),
    ...(desde || hasta
      ? {
          fecha: {
            ...(desde ? { gte: new Date(desde) } : {}),
            ...(hasta ? { lte: new Date(hasta) } : {}),
          },
        }
      : {}),
  };

  try {
    const citas = await prisma.cita.findMany({
      where,
      include: { pastor: { select: { id: true, nombre: true } }, persona: true },
      orderBy: { fecha: 'asc' },
    });
    res.json(citas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar citas.' });
  }
});

// PUT /api/citas/:id/estado — confirmar, cancelar, completar
router.put(
  '/:id/estado',
  [body('estado').isIn(['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA'])],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Estado inválido', details: errors.array() });
    }
    try {
      const cita = await prisma.cita.update({
        where: { id: Number(req.params.id) },
        data: { estado: req.body.estado, notasInternas: req.body.notasInternas },
      });
      res.json(cita);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar la cita.' });
    }
  }
);

// DELETE /api/citas/:id — solo ADMIN/PASTOR
router.delete('/:id', requireRole('ADMIN', 'PASTOR'), async (req, res) => {
  try {
    await prisma.cita.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la cita.' });
  }
});

module.exports = router;
