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
