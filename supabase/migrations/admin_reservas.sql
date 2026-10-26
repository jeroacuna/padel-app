-- 1) Registro de cambios
create table if not exists auditoria (
  id bigserial primary key,
  tabla text not null, registro_id text not null, accion text not null,
  detalle jsonb not null default '{}',
  quien text, user_id uuid,
  created_at timestamptz not null default now() 
);
create index if not exists auditoria_registro_idx on auditoria (tabla, registro_id, created_at desc);
alter table auditoria enable row level security;
drop policy if exists "admins ven auditoría" on auditoria;
create policy "admins ven auditoría" on auditoria for select to authenticated using (es_admin());
grant select on auditoria to authenticated;

-- 2) Los administradores pueden LEER las reservas (los visitantes siguen sin acceso)
drop policy if exists "admins ven reservas" on reservas;
create policy "admins ven reservas" on reservas for select to authenticated using (es_admin());
grant select on reservas to authenticated;

-- 3) Ayudas internas (no se pueden llamar desde el navegador)
create or replace function exigir_admin() returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'No tenés permisos de administración.'; end if;
end $$;

create or replace function registrar_auditoria(p_tabla text, p_id text, p_accion text, p_detalle jsonb) returns void
language sql security definer set search_path = public as $$
  insert into auditoria (tabla, registro_id, accion, detalle, quien, user_id)
  values (p_tabla, p_id, p_accion, p_detalle, (select nombre from perfiles_admin where user_id = auth.uid()), auth.uid())
$$;

-- 4) Cambiar el estado de una reserva (pendiente / confirmada / cancelada / completada)
create or replace function admin_cambiar_estado(p_id uuid, p_estado text, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas;
begin
  perform exigir_admin();
  if p_estado not in ('pendiente','confirmada','cancelada','completada') then raise exception 'Estado inválido.'; end if;
  select * into r from reservas where id = p_id for update;
  if not found then raise exception 'La reserva no existe.'; end if;
  if r.estado = p_estado then return; end if;
  update reservas set estado = p_estado, updated_at = now(),
    notas = case when nullif(btrim(coalesce(p_nota, '')), '') is null then notas
                 else concat_ws(E'\n', notas, '[' || to_char(ahora_ar(), 'DD/MM HH24:MI') || '] ' || left(btrim(p_nota), 300)) end
  where id = p_id;
  perform registrar_auditoria('reservas', p_id::text, 'cambiar_estado', jsonb_build_object('de', r.estado, 'a', p_estado, 'nota', p_nota));
exception when unique_violation then
  raise exception 'Ese turno ya fue tomado por otra reserva: no se puede reactivar esta.';
end $$;

-- 5) Reprogramar (cambiar fecha, hora y/o cancha) con control de disponibilidad
create or replace function admin_reprogramar(p_id uuid, p_fecha date, p_hora int, p_cancha int) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas; h_ini int; h_fin int; ahora timestamp := ahora_ar();
begin
  perform exigir_admin();
  select * into r from reservas where id = p_id for update;
  if not found then raise exception 'La reserva no existe.'; end if;
  if r.estado in ('cancelada', 'completada') then raise exception 'No se puede reprogramar una reserva %.', r.estado; end if;
  select coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_inicio'), 9),
         coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_fin'), 22) into h_ini, h_fin;
  if p_hora not between h_ini and h_fin then raise exception 'Ese horario está fuera del horario de atención.'; end if;
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora <= extract(hour from ahora)::int) then
    raise exception 'El nuevo turno ya pasó.';
  end if;
  if not exists (select 1 from canchas where id = p_cancha and activa) then raise exception 'La cancha no está disponible.'; end if;
  update reservas set fecha = p_fecha, hora = p_hora, cancha_id = p_cancha, updated_at = now() where id = p_id;
  perform registrar_auditoria('reservas', p_id::text, 'reprogramar', jsonb_build_object(
    'de', jsonb_build_object('fecha', r.fecha, 'hora', r.hora, 'cancha', r.cancha_id),
    'a',  jsonb_build_object('fecha', p_fecha, 'hora', p_hora, 'cancha', p_cancha)));
exception when unique_violation then
  raise exception 'Ese turno ya está ocupado por otra reserva.';
end $$;

-- 6) Permisos: las funciones nuevas NO son públicas
revoke execute on function exigir_admin(), registrar_auditoria(text, text, text, jsonb),
  admin_cambiar_estado(uuid, text, text), admin_reprogramar(uuid, date, int, int) from public, anon, authenticated;
grant execute on function admin_cambiar_estado(uuid, text, text), admin_reprogramar(uuid, date, int, int) to authenticated;