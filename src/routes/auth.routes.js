const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const usuario = await prisma.usuario.findUnique({ where: { email } });
      if (!usuario || !usuario.activo) {
        return res.status(401).json({ error: 'Credenciales incorrectas.' });
      }

      const passwordOk = await bcrypt.compare(password, usuario.passwordHash);
      if (!passwordOk) {
        return res.status(401).json({ error: 'Credenciales incorrectas.' });
      }

      const token = jwt.sign(
        { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al iniciar sesión.' });
    }
  }
);

// POST /api/auth/usuarios  (crear pastor/lider/admin) — SOLO ADMIN
router.post(
  '/usuarios',
  requireAuth,
  requireRole('ADMIN'),
  [
    body('nombre').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('rol').isIn(['ADMIN', 'PASTOR', 'LIDER']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const { nombre, email, password, rol, telefono } = req.body;

    try {
      const existe = await prisma.usuario.findUnique({ where: { email } });
      if (existe) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const usuario = await prisma.usuario.create({
        data: { nombre, email, passwordHash, rol, telefono },
      });

      res.status(201).json({
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear usuario.' });
    }
  }
);

// GET /api/auth/me — perfil del usuario autenticado
router.get('/me', requireAuth, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario.id },
    select: { id: true, nombre: true, email: true, rol: true, telefono: true },
  });
  res.json(usuario);
});

module.exports = router;
