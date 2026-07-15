/**
 * Script para crear el bucket de Supabase Storage.
 *
 * Ejecutar una sola vez:
 *   node src/setup-storage.js
 *
 * Requiere que SUPABASE_URL y SUPABASE_SERVICE_KEY estén en .env
 */
require('dotenv').config();
const supabase = require('./lib/supabase');

const BUCKET = 'iglesia';

async function setup() {
  console.log('🪣  Configurando Supabase Storage...\n');

  // 1. Verificar conexión
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error('❌ Error al listar buckets:', listError.message);
    console.error('   Verifica que SUPABASE_URL y SUPABASE_SERVICE_KEY sean correctos.');
    process.exit(1);
  }
  console.log('✅ Conexión con Supabase OK');
  console.log('   Buckets existentes:', buckets.map((b) => b.name).join(', ') || '(ninguno)');

  // 2. Verificar si el bucket ya existe
  const existe = buckets.find((b) => b.name === BUCKET);
  if (existe) {
    console.log(`\n✅ Bucket "${BUCKET}" ya existe. Nada que hacer.`);
    process.exit(0);
  }

  // 3. Crear el bucket (público)
  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ],
  });

  if (createError) {
    console.error('❌ Error al crear bucket:', createError.message);
    process.exit(1);
  }

  console.log(`\n✅ Bucket "${BUCKET}" creado exitosamente (público, max 5MB, solo imágenes).`);
  console.log('\n📌 Siguiente paso:');
  console.log('   Añade SUPABASE_URL y SUPABASE_SERVICE_KEY al .env de Render.');
  console.log('   (En Supabase > Settings > API > service_role key)');
}

setup().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
