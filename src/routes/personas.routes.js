const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { crearNotificacion } = require('../lib/notificaciones');
const { registrarAuditoria } = require('../lib/audit');

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

      const data = { ...req.body };

      // Convertir strings de fecha a objetos Date
      for (const key of ['fechaNacimiento', 'fechaBautismo', 'fechaIngreso']) {
        const val = data[key];
        if (!val || val === '') {
          data[key] = key === 'fechaIngreso' ? new Date() : null;
        } else {
          data[key] = new Date(val);
        }
      }

      // Asegurar que bautizado sea boolean
      if (typeof data.bautizado === 'string') {
        data.bautizado = data.bautizado === 'true' || data.bautizado === 'Si';
      }

      // Strings vacíos → null
      for (const key of ['tipoDocumento', 'numeroDocumento', 'email', 'barrio', 'direccion', 'ministerio', 'rolIglesia', 'notas', 'genero', 'estadoCivil']) {
        if (data[key] === '') data[key] = null;
      }

      delete data.id;
      delete data.createdAt;
      delete data.updatedAt;

      const persona = await prisma.persona.create({ data });
      crearNotificacion({ tipo: 'nuevo_miembro', titulo: 'Nuevo miembro registrado', mensaje: `${persona.nombres} ${persona.apellidos} fue agregado como miembro.` }, { push: true, pushTodos: true });
      registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'CREATE', entidad: 'Persona', entidadId: persona.id, detalle: `${persona.nombres} ${persona.apellidos}` });
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
    const data = { ...req.body };

    // Validar duplicado de documento (excluyendo la misma persona)
    if (data.numeroDocumento) {
      const existe = await prisma.persona.findFirst({
        where: {
          numeroDocumento: data.numeroDocumento,
          id: { not: Number(req.params.id) },
        },
      });
      if (existe) {
        return res.status(409).json({ error: 'Ya existe otra persona con ese número de documento.' });
      }
    }

    // Convertir strings de fecha a objetos Date, o null si están vacíos
    for (const key of ['fechaNacimiento', 'fechaBautismo', 'fechaIngreso']) {
      const val = data[key];
      if (!val || val === '') {
        data[key] = key === 'fechaIngreso' ? new Date() : null;
      } else {
        data[key] = new Date(val);
      }
    }

    // Asegurar que bautizado sea boolean
    if (typeof data.bautizado === 'string') {
      data.bautizado = data.bautizado === 'true' || data.bautizado === 'Si';
    }

    // Strings vacíos → null
    for (const key of ['tipoDocumento', 'numeroDocumento', 'email', 'barrio', 'direccion', 'ministerio', 'rolIglesia', 'notas', 'genero', 'estadoCivil']) {
      if (data[key] === '') data[key] = null;
    }

    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    const persona = await prisma.persona.update({
      where: { id: Number(req.params.id) },
      data,
    });
    registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'UPDATE', entidad: 'Persona', entidadId: persona.id, detalle: `${persona.nombres} ${persona.apellidos}` });
    res.json(persona);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar persona.' });
  }
});

// DELETE /api/personas/:id — eliminación física + visita asociada
router.delete('/:id', requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  try {
    const persona = await prisma.persona.findUnique({ where: { id: Number(req.params.id) } });
    if (!persona) return res.status(404).json({ error: 'Persona no encontrada.' });

    // Si es visitante, también eliminar la visita asociada
    if (persona.rolIglesia === 'Visitante') {
      await prisma.visita.deleteMany({
        where: {
          nombres: persona.nombres,
          apellidos: persona.apellidos,
          telefono: persona.telefono,
        },
      });
    }

    await prisma.persona.delete({ where: { id: Number(req.params.id) } });
    registrarAuditoria({ usuario: req.usuario?.nombre, usuarioId: req.usuario?.id, accion: 'DELETE', entidad: 'Persona', entidadId: persona.id, detalle: `${persona.nombres} ${persona.apellidos}` });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar persona.' });
  }
});

module.exports = router;
