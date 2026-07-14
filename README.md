# Backend — Iglesia Misión Panamericana Centro de Fe y Esperanza

API REST en Node.js + Express + Prisma + PostgreSQL.

## Módulos incluidos
- **Auth**: login con JWT, roles `ADMIN`, `PASTOR`, `LIDER`.
- **Personas**: CRUD de la base de datos de feligreses (requiere login).
- **Servicios**: horarios de cultos — lectura pública, edición solo staff.
- **Eventos**: eventos realizados/próximos — lectura pública, edición staff.
- **Citas**: cualquier visitante puede solicitar cita con un pastor (formulario público, con límite anti-spam); el staff gestiona/confirma desde el panel.

## 1. Configurar la base de datos (Supabase — gratis)

1. Crea una cuenta en https://supabase.com (login con GitHub, sin tarjeta).
2. "New Project" → pon un nombre (ej: `iglesia-mision-panamericana`) y una contraseña segura para la DB (guárdala).
3. Espera a que aprovisione el proyecto (~2 min).
4. Ve a **Settings → Database → Connection string → URI**, copia la cadena y reemplaza `[YOUR-PASSWORD]` por la contraseña que pusiste.
5. Para producción usa el connection string de **Connection pooling** (puerto 6543) — es el recomendado para hosting serverless/Render.

## 2. Configurar el proyecto localmente

```bash
cd backend
cp .env.example .env
# Edita .env y pega tu DATABASE_URL de Supabase + genera un JWT_SECRET

npm install
npx prisma migrate dev --name init   # crea las tablas en Supabase
npm run seed                          # crea el usuario admin inicial
npm run dev                           # corre en http://localhost:4000
```

Genera un `JWT_SECRET` seguro con:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Usuario admin creado por el seed:
- Email: `jhojancamilorodriguez2017@gmail.com`
- Password: `camilo74845348` ⚠️ cámbiala apenas puedas (crea otro admin y desactiva este, o actualízalo directo en Supabase Table Editor).

## 3. Desplegar gratis en Render

1. Sube este backend a un repositorio en GitHub.
2. Entra a https://render.com (login con GitHub).
3. **New → Web Service** → conecta tu repo.
4. Configuración:
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npx prisma migrate deploy && npm start`
   - **Instance Type**: Free
5. En **Environment**, agrega las variables de tu `.env` (`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`).
6. Deploy. Render te da una URL gratis tipo `https://iglesia-backend.onrender.com`.

> Nota: el plan free de Render "duerme" el servicio tras 15 min sin uso y tarda ~30-50s en despertar en la siguiente petición. Es normal y no cuesta nada.

## Endpoints principales

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | No | Iniciar sesión |
| POST | `/api/auth/usuarios` | ADMIN | Crear pastor/líder/admin |
| GET | `/api/personas` | Sí | Listar personas (búsqueda, paginación) |
| POST | `/api/personas` | Sí | Crear persona |
| GET | `/api/servicios` | No | Horarios (para la web pública) |
| POST | `/api/servicios` | ADMIN/PASTOR | Crear horario |
| GET | `/api/eventos?tipo=proximos` | No | Eventos próximos/pasados |
| GET | `/api/citas/pastores-disponibles` | No | Lista de pastores para el formulario |
| POST | `/api/citas` | No | Solicitar cita (público) |
| GET | `/api/citas` | Sí | Ver/gestionar todas las citas |
| PUT | `/api/citas/:id/estado` | Sí | Confirmar/cancelar/completar cita |

## Siguiente paso
Cuando quieras, seguimos con el **frontend** (React) que consume esta API: página pública (horarios, eventos, formulario de citas) + panel privado de administración (login, gestión de personas/citas/eventos).
