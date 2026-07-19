const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { registrarAuditoria } = require('../lib/audit');

const router = express.Router();

// POST /api/2fa/setup — Generar secreto TOTP y URL otpauth
router.post('/setup', requireAuth, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });

    if (usuario.twoFactorEnabled) {
      return res.status(400).json({ error: 'La autenticación de dos factores ya está habilitada. Desactívala primero.' });
    }

    // Import dinámico de otpauth (ESM)
    const otpauth = await import('otpauth');

    const totp = new otpauth.TOTP({
      issuer: 'IglesiaMisiónPanamericana',
      label: usuario.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: new otpauth.Secret({ size: 20 }),
    });

    const secret = totp.secret.base32;
    const otpauthUrl = totp.toString();

    // Guardar el secreto temporalmente (sin habilitar aún)
    await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { twoFactorSecret: secret },
    });

    res.json({ secret, otpauthUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al configurar la autenticación de dos factores.' });
  }
});

// POST /api/2fa/verify — Verificar código y habilitar 2FA
router.post(
  '/verify',
  requireAuth,
  [body('code').isLength({ min: 6, max: 6 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Código inválido.', details: errors.array() });
    }

    try {
      const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });

      if (!usuario.twoFactorSecret) {
        return res.status(400).json({ error: 'Primero debes generar un secreto con /setup.' });
      }

      if (usuario.twoFactorEnabled) {
        return res.status(400).json({ error: 'La autenticación de dos factores ya está habilitada.' });
      }

      const otpauth = await import('otpauth');

      const totp = new otpauth.TOTP({
        issuer: 'IglesiaMisiónPanamericana',
        label: usuario.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: otpauth.Secret.fromBase32(usuario.twoFactorSecret),
      });

      const delta = totp.validate({ token: req.body.code, window: 1 });

      if (delta === null) {
        return res.status(400).json({ error: 'Código incorrecto. Intenta de nuevo.' });
      }

      await prisma.usuario.update({
        where: { id: req.usuario.id },
        data: { twoFactorEnabled: true },
      });

      registrarAuditoria({
        usuario: req.usuario.email,
        usuarioId: req.usuario.id,
        accion: 'UPDATE',
        entidad: 'Usuario',
        entidadId: req.usuario.id,
        detalle: 'Autenticación de dos factores habilitada',
      });

      res.json({ ok: true, message: 'Autenticación de dos factores habilitada correctamente.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al verificar el código.' });
    }
  }
);

// POST /api/2fa/disable — Deshabilitar 2FA
router.post(
  '/disable',
  requireAuth,
  [body('code').isLength({ min: 6, max: 6 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Código inválido.', details: errors.array() });
    }

    try {
      const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });

      if (!usuario.twoFactorEnabled) {
        return res.status(400).json({ error: 'La autenticación de dos factores no está habilitada.' });
      }

      const otpauth = await import('otpauth');

      const totp = new otpauth.TOTP({
        issuer: 'IglesiaMisiónPanamericana',
        label: usuario.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: otpauth.Secret.fromBase32(usuario.twoFactorSecret),
      });

      const delta = totp.validate({ token: req.body.code, window: 1 });

      if (delta === null) {
        return res.status(400).json({ error: 'Código incorrecto. Intenta de nuevo.' });
      }

      await prisma.usuario.update({
        where: { id: req.usuario.id },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });

      registrarAuditoria({
        usuario: req.usuario.email,
        usuarioId: req.usuario.id,
        accion: 'UPDATE',
        entidad: 'Usuario',
        entidadId: req.usuario.id,
        detalle: 'Autenticación de dos factores deshabilitada',
      });

      res.json({ ok: true, message: 'Autenticación de dos factores deshabilitada correctamente.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al deshabilitar la autenticación de dos factores.' });
    }
  }
);

// POST /api/2fa/validate — Validar código después del login (sin auth, usa tempToken)
router.post(
  '/validate',
  [body('token').notEmpty(), body('code').isLength({ min: 6, max: 6 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', details: errors.array() });
    }

    const { token, code } = req.body;

    try {
      // Verificar el temp token
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        return res.status(401).json({ error: 'Token temporal inválido o expirado.' });
      }

      if (!payload.temp2FA) {
        return res.status(400).json({ error: 'Token no válido para verificación 2FA.' });
      }

      const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } });
      if (!usuario || !usuario.activo) {
        return res.status(401).json({ error: 'Usuario no encontrado o desactivado.' });
      }

      if (!usuario.twoFactorEnabled || !usuario.twoFactorSecret) {
        return res.status(400).json({ error: 'La autenticación de dos factores no está habilitada.' });
      }

      const otpauth = await import('otpauth');

      const totp = new otpauth.TOTP({
        issuer: 'IglesiaMisiónPanamericana',
        label: usuario.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: otpauth.Secret.fromBase32(usuario.twoFactorSecret),
      });

      const delta = totp.validate({ token: code, window: 1 });

      if (delta === null) {
        return res.status(400).json({ error: 'Código incorrecto. Intenta de nuevo.' });
      }

      // Código correcto: generar el token real
      const fullToken = jwt.sign(
        { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        valid: true,
        fullToken,
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al validar el código.' });
    }
  }
);

module.exports = router;
