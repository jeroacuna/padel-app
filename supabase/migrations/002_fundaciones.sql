-- 002 · Fundaciones del panel de administración
-- Qué hace: hora argentina, validaciones en el servidor, estados de reserva, índice único parcial,
-- tabla de admins, permisos mínimos. NO borra datos. Correr UNA vez, después de 001.

-- 0) Hora de Argentina (el servidor trabaja en UTC)
create or replace function ahora_ar() returns timestamp language sql stable as
$$ select timezone('America/Argentina/Buenos_Aires', now()) $$;

-- 1) Configuración mínima del complejo (solo datos NO sensibles: se lee desde la web pública)
create table if not exists config_complejo (clave text primary key, valor jsonb not null);
alter table config_complejo enable row level security;
drop policy if exists "config pública" on config_complejo;
create policy "config pública" on config_complejo for select using (true);
insert into config_complejo (clave, valor) values ('hora_inicio', '9'), ('hora_fin', '22') on conflict (clave) do nothing;

-- 2) Canchas: activar / desactivar sin borrar historial
alter table canchas add column if not exists activa boolean not null default true;

-- 3) Reservas: estado de la reserva y estado del pago van por separado
alter table reservas add column if not exists estado text not null default 'confirmada';
alter table reservas add column if not exists pago_estado text not null default 'pendiente';
alter table reservas add column if not exists origen text not null default 'web';
alter table reservas add column if not exists notas text;
alter table reservas add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reservas_estado_chk') then
    alter table reservas add constraint reservas_estado_chk check (estado in ('pendiente','confirmada','cancelada','completada'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservas_pago_chk') then
    alter table reservas add constraint reservas_pago_chk check (pago_estado in ('pendiente','parcial','pagado','reembolsado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservas_origen_chk') then
    alter table reservas add constraint reservas_origen_chk check (origen in ('web','whatsapp','telefono','presencial'));
  end if;
end $$;

-- 4) Un turno solo puede estar ocupado por UNA reserva NO cancelada (así se puede volver a reservar un turno cancelado)
create unique index if not exists reservas_turno_unico on reservas (fecha, hora, cancha_id) where estado <> 'cancelada';
alter table reservas drop constraint if exists reservas_fecha_hora_cancha_id_key;

-- 5) Administradores
create table if not exists perfiles_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text, rol text not null default 'staff' check (rol in ('owner','staff')),
  activo boolean not null default true, created_at timestamptz default now()
);
alter table perfiles_admin enable row level security;
drop policy if exists "ver mi perfil" on perfiles_admin;
create policy "ver mi perfil" on perfiles_admin for select to authenticated using (user_id = auth.uid());

create or replace function es_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from perfiles_admin where user_id = auth.uid() and activo) $$;
create or replace function rol_admin() returns text language sql stable security definer set search_path = public as
$$ select rol from perfiles_admin where user_id = auth.uid() and activo $$;

-- 6) Validación de datos de contacto (la base NO confía en lo que manda el navegador)
create or replace function validar_contacto(p_nombre text, p_telefono text, p_email text) returns void
language plpgsql immutable as $$
begin
  if p_nombre is null or char_length(btrim(p_nombre)) not between 2 and 80 then raise exception 'Revisá el nombre (entre 2 y 80 caracteres).'; end if;
  if p_telefono is null or p_telefono !~ '^[0-9+()[:space:]-]{6,25}$' then raise exception 'Revisá el teléfono.'; end if;
  if p_email is null or char_length(p_email) > 120 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Revisá el email.'; end if;
end $$;

-- 7) Funciones públicas, ahora con validaciones y hora argentina
create or replace function ocupados(p_fecha date) returns table(hora int, cancha_id int)
language sql security definer set search_path = public as
$$ select r.hora, r.cancha_id from reservas r where r.fecha = p_fecha and r.estado <> 'cancelada' $$;

create or replace function crear_reserva(p_fecha date, p_hora int, p_cancha int, p_nombre text, p_apellido text,
  p_telefono text, p_email text, p_precio int) returns text
language plpgsql security definer set search_path = public as $$
declare
  cod text := upper(substr(md5(random()::text), 1, 6));
  ahora timestamp := ahora_ar(); h_ini int; h_fin int; c canchas;
begin
  perform validar_contacto(p_nombre, p_telefono, p_email);
  if p_apellido is null or char_length(btrim(p_apellido)) not between 2 and 80 then raise exception 'Revisá el apellido.'; end if;
  select coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_inicio'), 9),
         coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_fin'), 22) into h_ini, h_fin;
  if p_hora not between h_ini and h_fin then raise exception 'Ese horario está fuera del horario de atención.'; end if;
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora <= extract(hour from ahora)::int) then
    raise exception 'Ese turno ya pasó.';
  end if;
  select * into c from canchas where id = p_cancha and activa;
  if not found then raise exception 'La cancha no está disponible.'; end if;
  insert into reservas(codigo, fecha, hora, cancha_id, nombre, apellido, telefono, email, precio)
  values (cod, p_fecha, p_hora, p_cancha, btrim(p_nombre), btrim(p_apellido), btrim(p_telefono), btrim(p_email), c.precio);  -- el precio lo decide la base
  return cod;
exception when unique_violation then
  raise exception 'Ese turno ya fue reservado. Elegí otro.';
end $$;

create or replace function inscribir(p_torneo int, p_categoria text, p_j1 text, p_j2 text, p_tel text, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare t torneos; n int; cod text := upper(substr(md5(random()::text), 1, 6));
begin
  perform validar_contacto(p_j1, p_tel, p_email);
  if p_j2 is null or char_length(btrim(p_j2)) not between 2 and 80 then raise exception 'Revisá el nombre del jugador 2.'; end if;
  select * into t from torneos where id = p_torneo for update;
  if not found then raise exception 'El torneo no existe.'; end if;
  if not (p_categoria = any (t.categorias)) then raise exception 'Categoría inválida.'; end if;
  if exists (select 1 from inscripciones where torneo_id = p_torneo and categoria = p_categoria
             and lower(email) = lower(btrim(p_email)) and estado <> 'cancelada') then
    raise exception 'Ya hay una inscripción con ese email en esta categoría.';
  end if;
  select count(*) into n from inscripciones where torneo_id = p_torneo and estado <> 'cancelada';
  if n >= t.cupos then raise exception 'Los cupos de este torneo están completos.'; end if;
  insert into inscripciones(codigo, torneo_id, categoria, jugador1, jugador2, telefono, email)
  values (cod, p_torneo, p_categoria, btrim(p_j1), btrim(p_j2), btrim(p_tel), btrim(p_email));
  return cod;
end $$;

create or replace function reservar_clase(p_prof int, p_fecha date, p_hora int, p_nombre text, p_telefono text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare cod text := upper(substr(md5(random()::text), 1, 6)); p profesores; ahora timestamp := ahora_ar();
begin
  perform validar_contacto(p_nombre, p_telefono, p_email);
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora <= extract(hour from ahora)::int) then
    raise exception 'Ese horario ya pasó.';
  end if;
  select * into p from profesores where id = p_prof;
  if not found then raise exception 'El profesor no existe.'; end if;
  if not coalesce((p.horarios -> (extract(dow from p_fecha)::int)::text) @> to_jsonb(p_hora), false) then
    raise exception 'El profe no da clases en ese horario.';
  end if;
  insert into clases(codigo, profesor_id, fecha, hora, nombre, telefono, email)
  values (cod, p_prof, p_fecha, p_hora, btrim(p_nombre), btrim(p_telefono), btrim(p_email));
  return cod;
exception when unique_violation then
  raise exception 'Ese horario ya fue reservado. Elegí otro.';
end $$;

-- 8) Permisos mínimos: se quita todo y se devuelve solo lo necesario
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant select on canchas, torneos, profesores, avisos, torneos_info, config_complejo to anon, authenticated;
grant select on perfiles_admin to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function ocupados(date), crear_reserva(date,int,int,text,text,text,text,int), inscribir(int,text,text,text,text,text),
  clases_ocupadas(int,date), reservar_clase(int,date,int,text,text,text) to anon, authenticated;
grant execute on function es_admin(), rol_admin() to authenticated;