const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

/**
 * Envía un correo electrónico por Brevo (HTTPS — funciona en Render).
 * @param {{ to: string, subject: string, html: string }} opciones
 */
async function enviarCorreo({ to, subject, html }) {
  if (!process.env.BREVO_API_KEY) {
    console.warn('[mail] BREVO_API_KEY no configurado — correo NO enviado a', to);
    return null;
  }

  const senderEmail = process.env.SMTP_FROM_EMAIL || 'jhojancamilorodriguez2017@gmail.com';
  const senderName = process.env.SMTP_FROM_NAME || 'Misión Panamericana';

  try {
    const res = await fetch(BREVO_API, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[mail] ❌ Error enviando correo a', to, ':', data.message || JSON.stringify(data));
      return null;
    }

    console.log('[mail] ✅ Correo enviado a', to, '| ID:', data.messageId);
    return data;
  } catch (err) {
    console.error('[mail] ❌ Error enviando correo a', to, ':', err.message);
    return null;
  }
}

/**
 * Convierte hora "HH:MM" (24h) a formato 12 horas con AM/PM.
 */
function formatTime12h(hora) {
  if (!hora) return '';
  const [h, m] = hora.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const horas12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${horas12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Plantilla HTML para recordatorio de cita pastoral.
 */
function plantillaRecordatorio({ pastorNombre, solicitante, fecha, hora, motivo }) {
  const fechaFormato = new Date(fecha).toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const horaFormato = formatTime12h(hora);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #024293, #3E52C3); padding: 28px 24px; text-align: center; }
        .header h1 { color: #FFCD02; font-size: 20px; margin: 0 0 4px; }
        .header p { color: rgba(255,255,255,0.8); font-size: 13px; margin: 0; }
        .body { padding: 24px; }
        .badge { display: inline-block; background: #FFCD02; color: #0A2A57; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; }
        .detail { margin: 16px 0; padding: 16px; background: #f1f5fb; border-radius: 12px; }
        .detail-row { display: flex; margin-bottom: 8px; }
        .detail-row:last-child { margin-bottom: 0; }
        .detail-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; min-width: 80px; }
        .detail-value { font-size: 14px; color: #0A2A57; font-weight: 500; }
        .footer { padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { font-size: 11px; color: #94a3b8; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Misión Panamericana</h1>
          <p>Centro de Fe y Esperanza</p>
        </div>
        <div class="body">
          <p style="margin:0 0 8px"><span class="badge">Recordatorio de cita</span></p>
          <p style="font-size:15px; color:#334155; margin:0 0 16px">
            Hola <strong>${pastorNombre}</strong>, tienes una cita pastoral próxima:
          </p>
          <div class="detail">
            <div class="detail-row">
              <span class="detail-label">Fecha</span>
              <span class="detail-value">${fechaFormato}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Hora</span>
              <span class="detail-value">${horaFormato}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Persona</span>
              <span class="detail-value">${solicitante}</span>
            </div>
            ${motivo ? `
            <div class="detail-row">
              <span class="detail-label">Motivo</span>
              <span class="detail-value">${motivo}</span>
            </div>` : ''}
          </div>
          <p style="font-size:13px; color:#64748b; margin:16px 0 0">
            Por favor, confirma o cancela la cita desde el panel de administración.
          </p>
        </div>
        <div class="footer">
          <p>Este es un correo automático de recordatorio. No respondas a este mensaje.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = { enviarCorreo, plantillaRecordatorio, formatTime12h };
