const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas de personas requieren estar autenticado (admin, pastor o líder)
router.use(requireAuth);

// GET /api/personas?search=&ministerio=&page=1&limit=20
router.get('/', async (req, res) => {
  const { search, ministerio, page = 1, limit = 20 } = req.query;

  const where = {
    activo: true,
    ...(ministerio ? { ministerio } : {}),
    ...(search
      ? {
          OR: [
            { nombres: { contains: search, mode: 'insensitive' } },
            { apellidos: { contains: search, mode: 'insensitive' } },
            { numeroDocumento: { contains: search, mode: 'insensitive' } },
            { telefono: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  try {
    const [personas, total] = await Promise.all([
      prisma.persona.findMany({
        where,
        orderBy: { apellidos: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.persona.count({ where }),
    ]);

    res.json({ data: personas, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar personas.' });
  }
});

// GET /api/personas/:id
router.get('/:id', async (req, res) => {
  try {
    const persona = await prisma.persona.findUnique({
      where: { id: Number(req.params.id) },
      include: { citas: { orderBy: { fecha: 'desc' } } },
    });
    if (!persona) return res.status(404).json({ error: 'Persona no encontrada.' });
    res.json(persona);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener persona.' });
  }
});

router.post(
  '/',
  [body('nombres').notEmpty(), body('apellidos').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    try {
      // Validar duplicado solo si hay numeroDocumento
      if (req.body.numeroDocumento) {
        const existe = await prisma.persona.findUnique({
          where: { numeroDocumento: req.body.numeroDocumento }
        });
        if (existe) {
          return res.status(409).json({ error: 'Ya existe una persona con ese número de documento.' });
        }
      }

      const persona = await prisma.persona.create({ data: req.body });
      res.status(201).json(persona);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear persona.', details: err.message });
    }
  }
);

// PUT /api/personas/:id
router.put('/:id', async (req, res) => {
  try {
    const persona = await prisma.persona.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    res.json(persona);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar persona.' });
  }
});

// DELETE /api/personas/:id — borrado lógico (no se pierde el historial)
router.delete('/:id', requireRole('ADMIN', 'PASTOR'), async (req, res) => {
  try {
    await prisma.persona.update({
      where: { id: Number(req.params.id) },
      data: { activo: false },
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar persona.' });
  }
});

module.exports = router;
