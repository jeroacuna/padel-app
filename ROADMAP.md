# Roadmap · Padel Arena

Estado: ✅ hecho · 🔄 en curso · ⬜ pendiente

## Fase 0 · Auditoría ✅
- ✅ Revisión del repo, del esquema y de los permisos reales de Supabase.

## Fase 1 · Base administrativa
### 1A · Ordenar y asegurar 🔄
- ✅ `.gitignore`, `README.md`, `ROADMAP.md`
- ✅ Migraciones `001` (estado actual) y `002` (fundaciones): estados, índice único parcial, hora argentina, validaciones, permisos mínimos, tabla de admins
- ✅ Modo demo separado de producción (sin reservas locales falsas)
- ✅ Edge Function movida a `supabase/functions/`
- 🔄 Correr 001 y 002 en Supabase y verificar con `supabase/verificar.sql`
### 1B · Panel: login y estructura ⬜
- ⬜ `/admin/` con login (Supabase Auth), sesión, cierre de sesión, rutas protegidas
- ⬜ Sidebar, layout y dashboard vacío; acceso solo si estás en `perfiles_admin`

## Fase 2 · Reservas ⬜
Dashboard, listado con filtros, calendario diario/semanal, alta manual, edición, cancelación, estados.

## Fase 3 · Canchas y clientes ⬜
## Fase 4 · Pagos y estadísticas ⬜
## Fase 5 · Torneos, profesores y configuración ⬜
## Fase 6 · Experiencia del jugador ⬜
Consulta de reserva por código, solicitud de cancelación, emails, SEO (`TU-DOMINIO`), cifras y testimonios reales.
## Fase 7 · Calidad y entrega ⬜
Pruebas, accesibilidad, despliegue, documentación técnica y de usuario, demo para la PP.

## Etapa posterior (después del núcleo)
Reservas fijas · lista de espera · promociones · estadísticas avanzadas · notificaciones · ranking.

## Decisiones pendientes
- Estado inicial de una reserva web: hoy `confirmada`. ¿Pasa a `pendiente` con vencimiento? (se define en Fase 2)
- Reglas de cancelación (¿hasta cuántas horas antes?) (Fase 6)
- Roles: hoy `owner` y `staff` (a ajustar en Fase 1B)