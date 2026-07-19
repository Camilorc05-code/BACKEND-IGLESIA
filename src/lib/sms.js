let twilioClient = null;

function getClient() {
  if (twilioClient) return twilioClient;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[sms] Twilio no configurado. SMS no se enviarán.');
    return null;
  }
  const twilio = require('twilio');
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
}

async function enviarSMS(numero, mensaje) {
  const client = getClient();
  if (!client) {
    console.warn('[sms] Twilio no configurado. Mensaje no enviado:', mensaje);
    return false;
  }

  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    console.warn('[sms] TWILIO_PHONE_NUMBER no configurado.');
    return false;
  }

  try {
    await client.messages.create({
      body: mensaje,
      from,
      to: numero.startsWith('+') ? numero : `+57${numero}`,
    });
    return true;
  } catch (err) {
    console.error('[sms] Error enviando SMS:', err.message);
    return false;
  }
}

module.exports = { enviarSMS };
