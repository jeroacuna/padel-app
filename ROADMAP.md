# Roadmap · Padel Arena

Estado: ✅ hecho · 🔄 en curso · ⬜ pendiente

## Fase 0 · Auditoría ✅
## Fase 1 · Base administrativa ✅
- ✅ 1A: migraciones 001 y 002, modo demo separado de producción, validaciones y permisos mínimos
- ✅ 1B: `/admin/` con login (Supabase Auth), sesión, rutas protegidas, sidebar responsive

## Fase 2 · Reservas
### 2A · Ver y gestionar ✅
- ✅ Migración 003: lectura de reservas solo para admins, cambio de estado, reprogramación y registro de cambios (auditoría)
- ✅ Dashboard con datos reales: reservas de hoy y de la semana, ocupación, próximos turnos, cancelaciones recientes
- ✅ Listado de reservas con filtros (fechas, cancha, estado, búsqueda), orden y paginación
- ✅ Detalle de reserva: confirmar, completar, cancelar (con motivo), reactivar, reprogramar e historial
- 🔄 Correr 003 en Supabase y probar con reservas reales
### 2B · Calendario y reservas manuales 🔄
- ✅ Migración 004: alta manual de reservas (WhatsApp, teléfono, presencial) con validaciones y registro de cambios
- ✅ Calendario diario (canchas en columnas, horarios en filas) y semanal (ocupación por franja)
- ✅ Tocar un hueco libre abre el alta manual con cancha, fecha y hora ya elegidas; tocar una reserva abre su detalle
- 🔄 Correr 003 y 004 en Supabase y probar con reservas reales
- ⬜ Ingresos y pagos pendientes en el dashboard (se completan en la Fase 4)

## Fase 3 · Canchas y clientes ⬜
## Fase 4 · Pagos y estadísticas ⬜
## Fase 5 · Torneos, profesores y configuración ⬜
## Fase 6 · Experiencia del jugador ⬜
Consulta de reserva por código, solicitud de cancelación, emails, SEO (`TU-DOMINIO`), cifras y testimonios reales.
## Fase 7 · Calidad y entrega ⬜
Pruebas, accesibilidad, despliegue, documentación técnica y de usuario, demo para la PP.

## Etapa posterior
Reservas fijas · lista de espera · promociones · estadísticas avanzadas · notificaciones · ranking.

## Decisiones pendientes
- Estado inicial de una reserva web: hoy `confirmada`. ¿Pasa a `pendiente` con vencimiento?
- Reglas de cancelación para jugadores (Fase 6)
- Permisos distintos para `owner` y `staff` (hoy pueden hacer lo mismo)