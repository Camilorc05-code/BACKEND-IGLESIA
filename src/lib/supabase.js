const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn('⚠️  SUPABASE_URL o SUPABASE_SERVICE_KEY no definidos — Supabase Storage deshabilitado.');
  // Proxy que lanza error si alguien intenta usarlo
  supabase = new Proxy({}, {
    get() {
      throw new Error('Supabase Storage no está configurado. Define SUPABASE_URL y SUPABASE_SERVICE_KEY en .env');
    },
  });
}

module.exports = supabase;
