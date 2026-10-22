# Padel Arena

Web de gestión de un complejo de pádel: reservas de canchas, torneos, clases con profesores y avisos.
Proyecto final de Práctica Profesionalizante (carrera Full Stack).

**Stack:** HTML + CSS + JavaScript vanilla · Supabase (Postgres, RLS, funciones RPC, Edge Functions) · Resend (emails).

## Estructura
```
index.html, torneos.html, profesores.html   páginas públicas
css/  js/  assets/                          estilos, lógica y recursos
supabase/migrations/                        001, 002, 003...: estructura de la base (correr en orden, una vez cada una)
supabase/functions/enviar-email/            Edge Function de emails (Resend)
supabase/seed_demo.sql                      datos de ejemplo (opcional)
supabase/verificar.sql                      consultas para comprobar la base
supabase/crear_admin.sql                    crea el primer administrador
admin/                                      panel de administración (login, layout, módulos)
supabase/legacy/                            scripts viejos (referencia, ya reemplazados por las migraciones)
ROADMAP.md                                  avance del proyecto
```

## Puesta en marcha
1. Abrir con un servidor local (Live Server de VS Code).
2. Crear un proyecto en Supabase, correr `001` y luego `002` en el SQL Editor.
3. Pegar la URL y la clave **pública** (publishable/anon) en `js/supabase.js`. Nunca la `service_role` ni la `secret`.
4. Opcional: correr `seed_demo.sql` para tener datos de ejemplo.

## Modos de la app
- **Producción (por defecto):** usa Supabase. Si no hay conexión, la web lo avisa y **no guarda nada en el navegador**.
- **Demo:** datos locales de ejemplo que nunca tocan la base real. Se activa con `modo: 'demo'` en `js/config.js`
  o entrando con `?demo=1` (se apaga con `?demo=0`). Muestra un cartel naranja "MODO DEMO".

## Panel de administración
- Entrada: `/admin/` (login con email y contraseña de Supabase Auth). Solo entran usuarios que estén en la tabla `perfiles_admin`.
- Primer administrador: crear el usuario en Supabase (Authentication → Users) y correr `supabase/crear_admin.sql`.
- Recomendado: desactivar el registro público en Authentication ("Allow new users to sign up").
- El panel no funciona en modo demo ni sin conexión.
- Hoy permite: ver el dashboard, listar y filtrar reservas, y cambiar estado o reprogramar (todo queda en el historial).

## Seguridad (resumen)
- Las tablas con datos personales (`reservas`, `inscripciones`, `clases`) tienen RLS y **ningún acceso directo** para visitantes.
- El navegador solo puede usar funciones concretas (`crear_reserva`, `inscribir`, ...) que validan todo en el servidor.
- Precio, horarios, fechas pasadas y datos de contacto se validan en la base, no en el navegador.