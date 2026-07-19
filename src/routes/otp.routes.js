const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { enviarSMS } = require('../lib/sms');
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
    expira: Date.now() + 5 * 60 * 1000, // 5 minutos
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

// POST /api/otp/enviar — Enviar código SMS (funciona con tempToken)
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

    if (!usuario.telefono) {
      return res.status(400).json({ error: 'No tienes un número de teléfono registrado. Contacta al administrador.' });
    }

    const codigo = generarCodigo();
    guardarCodigo(usuario.id, codigo);

    const enviado = await enviarSMS(
      usuario.telefono,
      `Tu código de verificación es: ${codigo}. Vence en 5 minutos. Misión Panamericana.`
    );

    if (!enviado) {
      return res.status(500).json({ error: 'Error al enviar el SMS. Intenta de nuevo.' });
    }

    // En desarrollo, mostrar el código en consola
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP] Código para ${usuario.nombre}: ${codigo}`);
    }

    res.json({ ok: true, mensaje: `Código enviado a ${usuario.telefono}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al enviar el código.' });
  }
});

// POST /api/otp/validar — Validar código SMS y completar login
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
        detalle: 'Login con verificación SMS',
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
