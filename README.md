# Academia Elite · Coronelas de Durango

Sitio estático (HTML/CSS/JS) + panel de administración en `/admin/`.
Se publica en cualquier hosting estático/subdominio. El contenido se guarda en Supabase.

## Estructura
- `index.html`, `pagina.html` — sitio público (`pagina.html?slug=...` muestra las páginas creadas en el panel)
- `admin/` — panel de administración
- `js/data.js` — capa de datos (Supabase o modo demostración)
- `config.js` — credenciales de Supabase
- `supabase/schema.sql` — tablas, permisos (RLS) y almacenamiento de fotos

## Probar sin servidor (modo demostración)
Con `config.js` vacío todo funciona con datos guardados solo en el navegador:
`python -m http.server 8123` y abrir `http://localhost:8123/admin/` (cualquier correo y contraseña de 8+ caracteres).

## Publicar con datos reales
1. Crear un proyecto en supabase.com (o reutilizar el de Coronelas).
2. SQL Editor → pegar y ejecutar `supabase/schema.sql`.
3. Authentication → Providers → Email: activar. Recomendado: desactivar "Confirm email" solo para crear la primera cuenta, o confirmarla desde el correo.
4. **Crear primero la cuenta del superadministrador** en `/admin/` → "Crear cuenta". La primera cuenta registrada queda como superadministrador; las siguientes quedan "pendientes" hasta que ella les asigne permiso en "Cuentas y permisos".
5. Authentication → Settings: desactivar "Allow new users to sign up" una vez creadas las cuentas del equipo (o conservarlo: nadie entra sin permiso).
6. Copiar Project URL y anon key (Settings → API) en `config.js`.
7. Subir la carpeta completa al subdominio.

## Roles
| Rol | Puede |
|---|---|
| Superadministrador | Todo + cuentas y permisos |
| Administrador | Publicar, editar y eliminar |
| Editor | Publicar y editar |
| Consulta | Solo ver el panel |

## Cuentas del equipo (solo superadministrador)
El módulo **Cuentas y permisos** crea usuarios con una contraseña temporal; en su primer ingreso la persona debe elegir su propia contraseña (mientras no lo haga, la base de datos la trata como cuenta sin permisos).

Requiere una Edge Function (una sola vez):
1. Aplicar `supabase/schema.sql` (o, si ya estaba aplicado, `supabase/migracion-cuentas.sql`).
2. Supabase → Edge Functions → *Deploy a new function* → nombre `admin-users` → pegar `supabase/functions/admin-users/index.ts` → Deploy.
La clave de servicio la inyecta Supabase en la función; nunca va en el navegador ni en este repositorio.

## Aviso por WhatsApp de solicitudes nuevas

Cada solicitud nueva dispara la función `notify-enrollment`, que envía por la API oficial de WhatsApp (Meta) un aviso al administrador y una confirmación al tutor.

1. Meta Business: crea la app, agrega un número y obtén el **token permanente** y el **Phone number ID**.
2. Crea y envía a aprobación dos plantillas (categoría *Utilidad*, idioma `es_MX`):
   - `solicitud_nueva_admin` con 5 variables: `{{1}}` jugadora, `{{2}}` edad, `{{3}}` categoría, `{{4}}` tutor, `{{5}}` teléfono.
   - `solicitud_recibida` con 2 variables: `{{1}}` tutor, `{{2}}` jugadora.
3. Supabase → Edge Functions → crea `notify-enrollment` con `supabase/functions/notify-enrollment/index.ts` y **desactiva "Verify JWT"**.
4. Edge Functions → Secrets: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `ADMIN_PHONE` (10 dígitos). Opcionales: `TPL_ADMIN`, `TPL_TUTOR`, `TPL_LANG`.
5. SQL Editor: ejecuta `supabase/migracion-whatsapp.sql`.

## Galerías, avisos y padres de familia

- **Galerías:** álbumes de fotos y videos por grupo, entrenamiento o torneo. Los videos se suben como MP4/WebM (hasta 50 MB) o se pegan como enlace de YouTube/Vimeo. Cada galería tiene enlace directo `…/#album=ID`. Migración: `supabase/migracion-galerias.sql`.
- **Avisos:** comunicados publicados en `avisos.html`. Un administrador o superadministrador activa o desactiva la sección (la base de datos también la oculta cuando está desactivada). Desde el panel se comparten por WhatsApp y correo (enlace `wa.me`/`mailto`, sin servicios de pago). Migración: `supabase/migracion-avisos.sql`.
- **Padres de familia:** contactos (nombre, teléfono, correo, grupo) que solo ven los administradores; se pueden importar desde Excel/CSV. Los avisos también pueden enviarse a las solicitudes marcadas como Inscrita.
- Orden de migraciones en el editor SQL de Supabase: `migracion-galerias.sql` y luego `migracion-avisos.sql`. El aviso por WhatsApp automático (`migracion-whatsapp.sql`) está en pausa y no es necesario.
