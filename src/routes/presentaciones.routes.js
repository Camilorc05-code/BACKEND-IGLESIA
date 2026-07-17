const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/presentaciones — listar todas (solo staff)
router.get('/', requireAuth, async (req, res) => {
  try {
    const lista = await prisma.presentacionBebe.findMany({
      orderBy: { nombreBebe: 'asc' },
    });
    res.json(lista);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar presentaciones.' });
  }
});

// POST /api/presentaciones — crear (ADMIN, PASTOR, LIDER)
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'PASTOR', 'LIDER'),
  [
    body('nombreBebe').notEmpty().withMessage('Nombre del bebé requerido'),
    body('fechaNacimiento').notEmpty().withMessage('Fecha de nacimiento requerida'),
    body('nombreMadre').notEmpty().withMessage('Nombre de la madre requerido'),
    body('nombrePadre').notEmpty().withMessage('Nombre del padre requerido'),
    body('fechaPresentacion').notEmpty().withMessage('Fecha de presentación requerida'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const { nombreBebe, fechaNacimiento, nombreMadre, nombrePadre, fechaPresentacion, notas } = req.body;

    try {
      const bebe = await prisma.presentacionBebe.create({
        data: {
          nombreBebe,
          fechaNacimiento: new Date(fechaNacimiento),
          nombreMadre,
          nombrePadre,
          fechaPresentacion: new Date(fechaPresentacion),
          notas: notas || null,
        },
      });
      res.status(201).json(bebe);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear presentación.' });
    }
  }
);

// PUT /api/presentaciones/:id — editar
router.put(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'PASTOR', 'LIDER'),
  async (req, res) => {
    const { nombreBebe, fechaNacimiento, nombreMadre, nombrePadre, fechaPresentacion, notas } = req.body;

    try {
      const bebe = await prisma.presentacionBebe.update({
        where: { id: Number(req.params.id) },
        data: {
          ...(nombreBebe && { nombreBebe }),
          ...(fechaNacimiento && { fechaNacimiento: new Date(fechaNacimiento) }),
          ...(nombreMadre && { nombreMadre }),
          ...(nombrePadre && { nombrePadre }),
          ...(fechaPresentacion && { fechaPresentacion: new Date(fechaPresentacion) }),
          notas: notas !== undefined ? notas : undefined,
        },
      });
      res.json(bebe);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar presentación.' });
    }
  }
);

// DELETE /api/presentaciones/:id — eliminar
router.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'PASTOR', 'LIDER'),
  async (req, res) => {
    try {
      await prisma.presentacionBebe.delete({ where: { id: Number(req.params.id) } });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al eliminar presentación.' });
    }
  }
);

module.exports = router;
