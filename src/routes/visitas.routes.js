const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { enviarCorreo, plantillaNuevaVisita } = require('../lib/mail');
const { requireAuth } = require('../middleware/auth');

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

      // Usar transacción para crear Visita + Persona juntas
      const result = await prisma.$transaction(async (tx) => {
        const visita = await tx.visita.create({
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

        const notasParts = [];
        if (adicional) notasParts.push(adicional);
        if (asisteOtraIglesia === 'Si') notasParts.push('Asiste a otra iglesia');
        if (desearLlamada === 'Si') notasParts.push('Desea que lo llamen');

        const persona = await tx.persona.create({
          data: {
            nombres,
            apellidos,
            telefono,
            email: email || null,
            rolIglesia: 'Visitante',
            notas: notasParts.length > 0 ? notasParts.join(' | ') : null,
          },
        });

        return { visita, persona };
      });

      console.log('[visitas] ✅ Visita y Persona creadas:', result.visita.id, result.persona.id);
      res.status(201).json({ ok: true, id: result.visita.id });

      // Notificar a usuarios ADMIN por correo (en background, sin bloquear respuesta)
      prisma.usuario.findMany({
        where: { rol: 'ADMIN', activo: true },
        select: { email: true },
      })
        .then((admins) => {
          const html = plantillaNuevaVisita({
            nombres, apellidos, telefono, email, adicional, asisteOtraIglesia, desearLlamada,
          });
          for (const admin of admins) {
            enviarCorreo({ to: admin.email, subject: 'Nueva persona registrada en el sitio', html });
          }
        })
        .catch((e) => console.error('[visitas] Error enviando notificación a admins:', e.message));
    } catch (err) {
      console.error('Error al crear visita:', err);
      res.status(500).json({ error: 'Error al registrar visita.' });
    }
  }
);

// GET /api/visitas — listar visitas (requiere auth)
router.get('/', requireAuth, async (req, res) => {
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

// DELETE /api/visitas/:id — eliminar visita (requiere auth)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.visita.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al eliminar visita:', err);
    res.status(500).json({ error: 'Error al eliminar visita.' });
  }
});

module.exports = router;
