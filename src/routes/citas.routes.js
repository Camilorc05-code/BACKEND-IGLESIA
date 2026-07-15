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

// GET /api/citas/pastores-disponibles — PÚBLICO (lista de pastores/líderes para el formulario)
router.get('/pastores-disponibles', async (req, res) => {
  try {
    const pastores = await prisma.usuario.findMany({
      where: { rol: { in: ['PASTOR', 'LIDER'] }, activo: true },
      select: { id: true, nombre: true, rol: true },
    });
    res.json(pastores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pastores.' });
  }
});

// GET /api/citas/ocupados — PÚBLICO: devuelve slots ocupados para el calendario
// Query params opcionales: mes (YYYY-MM), pastorId
router.get('/ocupados', async (req, res) => {
  const { mes, pastorId } = req.query;

  const where = {
    estado: { not: 'CANCELADA' },
    ...(pastorId ? { pastorId: Number(pastorId) } : {}),
    ...(mes
      ? {
          fecha: {
            gte: new Date(mes + '-01T00:00:00.000Z'),
            lt: new Date(new Date(mes + '-01T00:00:00.000Z').setMonth(new Date(mes + '-01T00:00:00.000Z').getMonth() + 1)),
          },
        }
      : {}),
  };

  try {
    const citas = await prisma.cita.findMany({
      where,
      select: {
        fecha: true,
        hora: true,
        pastorId: true,
        estado: true,
      },
      orderBy: { fecha: 'asc' },
    });
    res.json(citas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener citas ocupadas.' });
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

// GET /api/citas/recordatorios — citas próximas (48h) que aún no tienen recordatorio enviado
router.get('/recordatorios', async (req, res) => {
  const ahora = new Date();
  const en48h = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);

  try {
    const citas = await prisma.cita.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
        recordatorioEnviado: false,
        fecha: { gte: ahora, lte: en48h },
      },
      include: { pastor: { select: { id: true, nombre: true, email: true } } },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
    res.json(citas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener recordatorios.' });
  }
});

// PUT /api/citas/:id/recordatorio — marcar recordatorio como enviado
router.put('/:id/recordatorio', async (req, res) => {
  try {
    const cita = await prisma.cita.update({
      where: { id: Number(req.params.id) },
      data: { recordatorioEnviado: true },
    });
    res.json(cita);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al marcar recordatorio.' });
  }
});

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

// DELETE /api/citas/:id — ADMIN/PASTOR/LIDER
router.delete('/:id', requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  try {
    await prisma.cita.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la cita.' });
  }
});

module.exports = router;
