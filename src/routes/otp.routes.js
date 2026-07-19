const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { enviarCorreo } = require('../lib/mail');
const { registrarAuditoria } = require('../lib/audit');

const router = express.Router();

// Almacén temporal de códigos OTP (en memoria)
const codigosOTP = new Map();

function generarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function guardarCodigo(usuarioId, codigo) {
  codigosOTP.set(usuarioId, {
    codigo,
    expira: Date.now() + 5 * 60 * 1000,
    intentos: 0,
  });
}

function verificarCodigo(usuarioId, codigo) {
  const entry = codigosOTP.get(usuarioId);
  if (!entry) return { ok: false, error: 'Código no encontrado. Solicita uno nuevo.' };
  if (Date.now() > entry.expira) {
    codigosOTP.delete(usuarioId);
    return { ok: false, error: 'Código expirado. Solicita uno nuevo.' };
  }
  if (entry.intentos >= 5) {
    codigosOTP.delete(usuarioId);
    return { ok: false, error: 'Demasiados intentos. Solicita un nuevo código.' };
  }
  entry.intentos++;
  if (entry.codigo !== codigo) {
    return { ok: false, error: 'Código incorrecto.' };
  }
  codigosOTP.delete(usuarioId);
  return { ok: true };
}

const plantillaOTP = (codigo, nombre) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Tahoma,sans-serif;">
  <div style="max-width:420px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#024293;padding:28px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Misión Panamericana</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Centro de Fe y Esperanza</p>
    </div>
    <div style="padding:32px 24px;text-align:center;">
      <p style="color:#333;font-size:15px;margin:0 0 8px;">Hola <strong>${nombre}</strong>,</p>
      <p style="color:#555;font-size:14px;margin:0 0 24px;">Tu código de verificación para ingresar al panel es:</p>
      <div style="background:#f8f9fb;border-radius:12px;padding:20px;margin:0 0 24px;">
        <span style="font-size:36px;font-weight:700;color:#024293;letter-spacing:8px;">${codigo}</span>
      </div>
      <p style="color:#999;font-size:12px;margin:0;">Este código vence en 5 minutos.</p>
      <p style="color:#999;font-size:12px;margin:8px 0 0;">Si no solicitaste este código, ignora este mensaje.</p>
    </div>
    <div style="background:#f8f9fb;padding:16px 24px;text-align:center;">
      <p style="color:#aaa;font-size:11px;margin:0;">© ${new Date().getFullYear()} Misión Panamericana — Centro de Fe y Esperanza</p>
    </div>
  </div>
</body>
</html>`;

// POST /api/otp/enviar — Enviar código por email
router.post('/enviar', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido.' });
  }

  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.temp2FA) return res.status(400).json({ error: 'Token inválido.' });
  } catch {
    return res.status(401).json({ error: 'Token expirado o inválido.' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } });
    if (!usuario || !usuario.activo) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const codigo = generarCodigo();
    guardarCodigo(usuario.id, codigo);

    await enviarCorreo({
      to: usuario.email,
      subject: 'Tu código de verificación — Misión Panamericana',
      html: plantillaOTP(codigo, usuario.nombre),
    });

    // En desarrollo, mostrar el código en consola
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP] Código para ${usuario.nombre} (${usuario.email}): ${codigo}`);
    }

    res.json({ ok: true, mensaje: `Código enviado a ${usuario.email}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al enviar el código.' });
  }
});

// POST /api/otp/validar — Validar código y completar login
router.post(
  '/validar',
  [body('token').notEmpty(), body('codigo').isLength({ min: 6, max: 6 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', details: errors.array() });
    }

    const { token, codigo } = req.body;

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
      if (!payload.temp2FA) return res.status(400).json({ error: 'Token inválido.' });
    } catch {
      return res.status(401).json({ error: 'Token expirado o inválido.' });
    }

    const resultado = verificarCodigo(payload.id, codigo);
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }

    try {
      const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } });
      if (!usuario || !usuario.activo) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      const fullToken = jwt.sign(
        { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      registrarAuditoria({
        usuario: usuario.email,
        usuarioId: usuario.id,
        accion: 'LOGIN',
        entidad: 'Usuario',
        entidadId: usuario.id,
        detalle: 'Login con verificación email OTP',
      });

      res.json({
        ok: true,
        fullToken,
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al completar el login.' });
    }
  }
);

module.exports = router;
