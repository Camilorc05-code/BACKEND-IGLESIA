const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');

const router = express.Router();

// Rate limit: máx 10 registros por hora por IP
const limiterVisitas = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
});

// POST /api/visitas — registro público de visitantes
router.post(
  '/',
  limiterVisitas,
  [
    body('nombres').trim().notEmpty().withMessage('Nombre es requerido'),
    body('apellidos').trim().notEmpty().withMessage('Apellido es requerido'),
    body('telefono').trim().notEmpty().withMessage('Celular es requerido'),
    body('asisteOtraIglesia').isIn(['Si', 'No']).withMessage('Valor inválido'),
    body('desearLlamada').isIn(['Si', 'No']).withMessage('Valor inválido'),
    body('email').optional({ values: 'null' }).isEmail().withMessage('Correo inválido'),
    body('adicional').optional({ values: 'null' }).isLength({ max: 200 }).withMessage('Máximo 200 caracteres'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
    }

    try {
      const { nombres, apellidos, email, telefono, adicional, asisteOtraIglesia, desearLlamada } = req.body;

      const visita = await prisma.visita.create({
        data: {
          nombres,
          apellidos,
          email: email || null,
          telefono,
          adicional: adicional || null,
          asisteOtraIglesia,
          desearLlamada,
        },
      });

      res.status(201).json({ ok: true, id: visita.id });
    } catch (err) {
      console.error('Error al crear visita:', err);
      res.status(500).json({ error: 'Error al registrar visita.' });
    }
  }
);

// GET /api/visitas — listar visitas (requiere auth)
router.get('/', require('../middleware/auth').requireAuth, async (req, res) => {
  try {
    const visitas = await prisma.visita.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(visitas);
  } catch (err) {
    console.error('Error al obtener visitas:', err);
    res.status(500).json({ error: 'Error al obtener visitas.' });
  }
});

module.exports = router;
