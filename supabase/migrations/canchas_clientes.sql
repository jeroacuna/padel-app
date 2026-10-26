-- 005 · Canchas, bloqueos y clientes
-- Qué hace: administrar canchas desde el panel, bloquear canchas (lluvia, mantenimiento, eventos) y que la web
-- pública y las reservas respeten esos bloqueos, y una base de clientes sin duplicados con su historial.
-- Correr UNA vez, después de 004. No borra datos.

/* ============ 1) BLOQUEOS DE CANCHA ============ */
create table if not exists bloqueos_cancha (
  id serial primary key,
  cancha_id int references canchas(id),                 -- null = todas las canchas (ej. lluvia)
  fecha_desde date not null, fecha_hasta date not null,
  hora_ini int not null default 0 check (hora_ini between 0 and 23),
  hora_fin int not null default 23 check (hora_fin between 0 and 23),
  tipo text not null check (tipo in ('lluvia', 'mantenimiento', 'evento', 'otro')),
  motivo text, creado_por uuid, created_at timestamptz not null default now(),
  check (fecha_hasta >= fecha_desde), check (hora_fin >= hora_ini)
);
alter table bloqueos_cancha enable row level security;
drop policy if exists "admins ven bloqueos" on bloqueos_cancha;
create policy "admins ven bloqueos" on bloqueos_cancha for select to authenticated using (es_admin());
revoke all on bloqueos_cancha from anon, authenticated;
grant select on bloqueos_cancha to authenticated;

create or replace function slot_bloqueado(p_fecha date, p_hora int, p_cancha int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bloqueos_cancha b
    where p_fecha between b.fecha_desde and b.fecha_hasta and p_hora between b.hora_ini and b.hora_fin
      and (b.cancha_id is null or b.cancha_id = p_cancha))
$$;

-- La web pública ve los turnos bloqueados como ocupados (sin saber el motivo)
create or replace function ocupados(p_fecha date) returns table(hora int, cancha_id int)
language sql security definer set search_path = public as $$
  select r.hora, r.cancha_id from reservas r where r.fecha = p_fecha and r.estado <> 'cancelada'
  union
  select h, c.id from bloqueos_cancha b
    cross join lateral generate_series(b.hora_ini, b.hora_fin) h
    join canchas c on (b.cancha_id is null or b.cancha_id = c.id)
  where p_fecha between b.fecha_desde and b.fecha_hasta and c.activa
$$;

create or replace function admin_crear_bloqueo(p_cancha int, p_desde date, p_hasta date, p_hora_ini int, p_hora_fin int, p_tipo text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ahora timestamp := ahora_ar(); nuevo int; afectadas int; mot text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 200);
begin
  perform exigir_admin();
  if p_tipo not in ('lluvia', 'mantenimiento', 'evento', 'otro') then raise exception 'Tipo de bloqueo inválido.'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Revisá las fechas del bloqueo.'; end if;
  if p_hasta - p_desde > 365 then raise exception 'Un bloqueo no puede durar más de un año.'; end if;
  if p_hasta < ahora::date then raise exception 'Ese período ya terminó.'; end if;
  if p_hora_ini is null or p_hora_fin is null or p_hora_ini not between 0 and 23 or p_hora_fin not between p_hora_ini and 23 then
    raise exception 'Revisá el rango de horas.';
  end if;
  if p_cancha is not null and not exists (select 1 from canchas where id = p_cancha) then raise exception 'La cancha no existe.'; end if;
  insert into bloqueos_cancha (cancha_id, fecha_desde, fecha_hasta, hora_ini, hora_fin, tipo, motivo, creado_por)
  values (p_cancha, p_desde, p_hasta, p_hora_ini, p_hora_fin, p_tipo, mot, auth.uid()) returning id into nuevo;
  -- NO se cancela nada automáticamente: se avisa cuántas reservas quedan afectadas para que el administrador decida
  select count(*) into afectadas from reservas r
   where r.estado <> 'cancelada' and r.fecha between p_desde and p_hasta and r.hora between p_hora_ini and p_hora_fin
     and (p_cancha is null or r.cancha_id = p_cancha)
     and (r.fecha > ahora::date or (r.fecha = ahora::date and r.hora >= extract(hour from ahora)::int));
  perform registrar_auditoria('bloqueos', nuevo::text, 'crear_bloqueo', jsonb_build_object('cancha', p_cancha, 'desde', p_desde, 'hasta', p_hasta,
    'horas', p_hora_ini || '-' || p_hora_fin, 'tipo', p_tipo, 'motivo', mot, 'afectadas', afectadas));
  return jsonb_build_object('id', nuevo, 'afectadas', afectadas);
end $$;

create or replace function admin_quitar_bloqueo(p_id int) returns void
language plpgsql security definer set search_path = public as $$
declare b bloqueos_cancha;
begin
  perform exigir_admin();
  delete from bloqueos_cancha where id = p_id returning * into b;
  if not found then raise exception 'El bloqueo no existe.'; end if;
  perform registrar_auditoria('bloqueos', p_id::text, 'quitar_bloqueo', jsonb_build_object('cancha', b.cancha_id, 'desde', b.fecha_desde, 'hasta', b.fecha_hasta, 'tipo', b.tipo));
end $$;

/* Las tres formas de reservar ahora respetan los bloqueos */
create or replace function crear_reserva(p_fecha date, p_hora int, p_cancha int, p_nombre text, p_apellido text,
  p_telefono text, p_email text, p_precio int) returns text
language plpgsql security definer set search_path = public as $$
declare cod text := upper(substr(md5(random()::text), 1, 6)); ahora timestamp := ahora_ar(); h_ini int; h_fin int; c canchas;
begin
  perform validar_contacto(p_nombre, p_telefono, p_email);
  if p_apellido is null or char_length(btrim(p_apellido)) not between 2 and 80 then raise exception 'Revisá el apellido.'; end if;
  select coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_inicio'), 9),
         coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_fin'), 22) into h_ini, h_fin;
  if p_hora not between h_ini and h_fin then raise exception 'Ese horario está fuera del horario de atención.'; end if;
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora <= extract(hour from ahora)::int) then raise exception 'Ese turno ya pasó.'; end if;
  select * into c from canchas where id = p_cancha and activa;
  if not found then raise exception 'La cancha no está disponible.'; end if;
  if slot_bloqueado(p_fecha, p_hora, p_cancha) then raise exception 'La cancha no está disponible en ese horario.'; end if;
  insert into reservas (codigo, fecha, hora, cancha_id, nombre, apellido, telefono, email, precio)
  values (cod, p_fecha, p_hora, p_cancha, btrim(p_nombre), btrim(p_apellido), btrim(p_telefono), btrim(p_email), c.precio);
  return cod;
exception when unique_violation then
  raise exception 'Ese turno ya fue reservado. Elegí otro.';
end $$;

create or replace function admin_crear_reserva(
  p_fecha date, p_hora int, p_cancha int, p_nombre text, p_apellido text, p_telefono text, p_email text,
  p_origen text, p_estado text default 'confirmada', p_precio int default null, p_notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare ahora timestamp := ahora_ar(); h_ini int; h_fin int; c canchas; nuevo uuid; cod text := upper(substr(md5(random()::text), 1, 6));
begin
  perform exigir_admin();
  p_nombre := btrim(coalesce(p_nombre, '')); p_apellido := btrim(coalesce(p_apellido, ''));
  p_telefono := btrim(coalesce(p_telefono, '')); p_email := nullif(btrim(coalesce(p_email, '')), '');
  if char_length(p_nombre) not between 2 and 80 then raise exception 'Revisá el nombre (entre 2 y 80 caracteres).'; end if;
  if char_length(p_apellido) > 80 then raise exception 'El apellido es demasiado largo.'; end if;
  if p_telefono <> '' and p_telefono !~ '^[0-9+()[:space:]-]{6,25}$' then raise exception 'Revisá el teléfono.'; end if;
  if p_email is not null and (char_length(p_email) > 120 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'Revisá el email.'; end if;
  if p_origen not in ('whatsapp', 'telefono', 'presencial') then raise exception 'Origen inválido.'; end if;
  if p_estado not in ('pendiente', 'confirmada') then raise exception 'Estado inicial inválido.'; end if;
  if p_precio is not null and p_precio not between 0 and 1000000 then raise exception 'Precio inválido.'; end if;
  select coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_inicio'), 9),
         coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_fin'), 22) into h_ini, h_fin;
  if p_hora not between h_ini and h_fin then raise exception 'Ese horario está fuera del horario de atención.'; end if;
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora < extract(hour from ahora)::int) then raise exception 'Ese turno ya pasó.'; end if;
  select * into c from canchas where id = p_cancha and activa;
  if not found then raise exception 'La cancha no está disponible.'; end if;
  if slot_bloqueado(p_fecha, p_hora, p_cancha) then raise exception 'La cancha está bloqueada en ese horario.'; end if;
  insert into reservas (codigo, fecha, hora, cancha_id, nombre, apellido, telefono, email, precio, origen, estado, notas)
  values (cod, p_fecha, p_hora, p_cancha, p_nombre, p_apellido, p_telefono, p_email, coalesce(p_precio, c.precio), p_origen, p_estado,
          left(nullif(btrim(coalesce(p_notas, '')), ''), 300)) returning id into nuevo;
  perform registrar_auditoria('reservas', nuevo::text, 'crear_manual', jsonb_build_object('origen', p_origen, 'estado', p_estado, 'precio', coalesce(p_precio, c.precio)));
  return nuevo;
exception when unique_violation then
  raise exception 'Ese turno ya está ocupado por otra reserva.';
end $$;

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
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora <= extract(hour from ahora)::int) then raise exception 'El nuevo turno ya pasó.'; end if;
  if not exists (select 1 from canchas where id = p_cancha and activa) then raise exception 'La cancha no está disponible.'; end if;
  if slot_bloqueado(p_fecha, p_hora, p_cancha) then raise exception 'La cancha está bloqueada en ese horario.'; end if;
  update reservas set fecha = p_fecha, hora = p_hora, cancha_id = p_cancha, updated_at = now() where id = p_id;
  perform registrar_auditoria('reservas', p_id::text, 'reprogramar', jsonb_build_object(
    'de', jsonb_build_object('fecha', r.fecha, 'hora', r.hora, 'cancha', r.cancha_id), 'a', jsonb_build_object('fecha', p_fecha, 'hora', p_hora, 'cancha', p_cancha)));
exception when unique_violation then
  raise exception 'Ese turno ya está ocupado por otra reserva.';
end $$;

/* ============ 2) ADMINISTRAR CANCHAS (nunca se borran: hay historial) ============ */
create or replace function admin_guardar_cancha(p_id int, p_nombre text, p_tipo text, p_precio int, p_activa boolean) returns int
language plpgsql security definer set search_path = public as $$
declare cid int := p_id; antes canchas;
begin
  perform exigir_admin();
  p_nombre := btrim(coalesce(p_nombre, '')); p_tipo := btrim(coalesce(p_tipo, ''));
  if char_length(p_nombre) not between 2 and 40 then raise exception 'El nombre debe tener entre 2 y 40 caracteres.'; end if;
  if char_length(p_tipo) not between 2 and 30 then raise exception 'Indicá el tipo de cancha (por ejemplo Panorámica o Indoor).'; end if;
  if p_precio is null or p_precio not between 0 and 1000000 then raise exception 'Precio inválido.'; end if;
  if exists (select 1 from canchas where lower(nombre) = lower(p_nombre) and id is distinct from p_id) then raise exception 'Ya existe una cancha con ese nombre.'; end if;
  if p_id is null then
    select coalesce(max(id), 0) + 1 into cid from canchas;
    insert into canchas (id, nombre, tipo, precio, activa) values (cid, p_nombre, p_tipo, p_precio, coalesce(p_activa, true));
    perform registrar_auditoria('canchas', cid::text, 'crear_cancha', jsonb_build_object('nombre', p_nombre, 'tipo', p_tipo, 'precio', p_precio));
  else
    select * into antes from canchas where id = p_id for update;
    if not found then raise exception 'La cancha no existe.'; end if;
    update canchas set nombre = p_nombre, tipo = p_tipo, precio = p_precio, activa = coalesce(p_activa, activa) where id = p_id;
    perform registrar_auditoria('canchas', p_id::text, 'editar_cancha', jsonb_build_object(
      'de', jsonb_build_object('nombre', antes.nombre, 'tipo', antes.tipo, 'precio', antes.precio, 'activa', antes.activa),
      'a', jsonb_build_object('nombre', p_nombre, 'tipo', p_tipo, 'precio', p_precio, 'activa', coalesce(p_activa, antes.activa))));
  end if;
  return cid;
exception when unique_violation then
  raise exception 'No se pudo guardar la cancha. Probá de nuevo.';
end $$;

/* ============ 3) CLIENTES ============ */
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, apellido text not null default '',
  telefono text, telefono_norm text, email text, notas_admin text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists clientes_tel_unico on clientes (telefono_norm) where telefono_norm is not null;
create index if not exists clientes_email_idx on clientes (lower(email));
alter table reservas add column if not exists cliente_id uuid references clientes(id) on delete set null;
create index if not exists reservas_cliente_idx on reservas (cliente_id);

alter table clientes enable row level security;
drop policy if exists "admins ven clientes" on clientes;
create policy "admins ven clientes" on clientes for select to authenticated using (es_admin());

-- Normaliza teléfonos argentinos: +54 9 343 695-1234, 0343 15 695 1234 y 3436951234 son la MISMA persona
create or replace function norm_tel(p text) returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if length(d) < 6 then return null; end if;
  if left(d, 2) = '54' and length(d) >= 12 then                       -- código de país (+54), y el 9 de los celulares
    d := substr(d, 3);
    if left(d, 1) = '9' and length(d) = 11 then d := substr(d, 2); end if;
  end if;
  if left(d, 1) = '0' then d := substr(d, 2); end if;                  -- el 0 del código de área
  if length(d) = 12 then                                               -- el "15" de los celulares en formato local
    if substr(d, 4, 2) = '15' then d := left(d, 3) || substr(d, 6);
    elsif substr(d, 3, 2) = '15' then d := left(d, 2) || substr(d, 5);
    elsif substr(d, 5, 2) = '15' then d := left(d, 4) || substr(d, 7); end if;
  end if;
  return right(d, 10);
end $$;

create or replace function obtener_o_crear_cliente(p_nombre text, p_apellido text, p_tel text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare tel text := norm_tel(p_tel); mail text := lower(nullif(btrim(coalesce(p_email, '')), '')); cid uuid;
begin
  if tel is null and mail is null then return null; end if;      -- sin datos de contacto no se puede identificar a nadie
  if tel is not null then select id into cid from clientes where telefono_norm = tel; end if;
  if cid is null and mail is not null then select id into cid from clientes where lower(email) = mail order by created_at limit 1; end if;
  if cid is null then
    begin
      insert into clientes (nombre, apellido, telefono, telefono_norm, email)
      values (btrim(p_nombre), btrim(coalesce(p_apellido, '')), nullif(btrim(coalesce(p_tel, '')), ''), tel, mail) returning id into cid;
    exception when unique_violation then
      select id into cid from clientes where telefono_norm = tel;
    end;
  else
    update clientes set email = coalesce(email, mail) where id = cid and email is null and mail is not null;
    update clientes set telefono = coalesce(telefono, nullif(btrim(coalesce(p_tel, '')), '')), telefono_norm = tel
      where id = cid and telefono_norm is null and tel is not null and not exists (select 1 from clientes c2 where c2.telefono_norm = tel);
  end if;
  return cid;
end $$;

create or replace function reservas_asignar_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is null then new.cliente_id := obtener_o_crear_cliente(new.nombre, new.apellido, new.telefono, new.email); end if;
  return new;
end $$;
drop trigger if exists reservas_cliente on reservas;
create trigger reservas_cliente before insert on reservas for each row execute function reservas_asignar_cliente();

-- Las reservas que ya existían se asocian a su cliente
do $$ declare r record; begin
  for r in select id, nombre, apellido, telefono, email from reservas where cliente_id is null order by created_at loop
    update reservas set cliente_id = obtener_o_crear_cliente(r.nombre, r.apellido, r.telefono, r.email) where id = r.id;
  end loop;
end $$;

drop view if exists clientes_resumen;
create view clientes_resumen with (security_invoker = true) as
  select c.id, c.nombre, c.apellido, c.telefono, c.email, c.notas_admin, c.created_at,
         count(r.id) filter (where r.estado <> 'cancelada') as reservas_total,
         count(r.id) filter (where r.estado = 'cancelada') as canceladas,
         max(r.fecha) filter (where r.estado <> 'cancelada') as ultima_reserva
  from clientes c left join reservas r on r.cliente_id = c.id group by c.id;

create or replace function admin_guardar_cliente(p_id uuid, p_nombre text, p_apellido text, p_telefono text, p_email text, p_notas text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin();
  p_nombre := btrim(coalesce(p_nombre, '')); p_apellido := btrim(coalesce(p_apellido, ''));
  p_telefono := btrim(coalesce(p_telefono, '')); p_email := nullif(btrim(coalesce(p_email, '')), '');
  if char_length(p_nombre) not between 2 and 80 then raise exception 'Revisá el nombre (entre 2 y 80 caracteres).'; end if;
  if char_length(p_apellido) > 80 then raise exception 'El apellido es demasiado largo.'; end if;
  if p_telefono <> '' and p_telefono !~ '^[0-9+()[:space:]-]{6,25}$' then raise exception 'Revisá el teléfono.'; end if;
  if p_email is not null and (char_length(p_email) > 120 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'Revisá el email.'; end if;
  if char_length(coalesce(p_notas, '')) > 500 then raise exception 'Las notas son demasiado largas (máximo 500 caracteres).'; end if;
  update clientes set nombre = p_nombre, apellido = p_apellido, telefono = nullif(p_telefono, ''), telefono_norm = norm_tel(p_telefono),
         email = lower(p_email), notas_admin = nullif(btrim(coalesce(p_notas, '')), ''), updated_at = now() where id = p_id;
  if not found then raise exception 'El cliente no existe.'; end if;
  perform registrar_auditoria('clientes', p_id::text, 'editar_cliente', '{}'::jsonb);
exception when unique_violation then
  raise exception 'Ya existe otro cliente con ese teléfono.';
end $$;

/* ============ 4) PERMISOS ============ */
revoke all on clientes, clientes_resumen from anon, authenticated;
grant select on clientes, clientes_resumen to authenticated;
revoke execute on function slot_bloqueado(date, int, int), norm_tel(text), obtener_o_crear_cliente(text, text, text, text), reservas_asignar_cliente(),
  admin_crear_bloqueo(int, date, date, int, int, text, text), admin_quitar_bloqueo(int), admin_guardar_cancha(int, text, text, int, boolean),
  admin_guardar_cliente(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function admin_crear_bloqueo(int, date, date, int, int, text, text), admin_quitar_bloqueo(int),
  admin_guardar_cancha(int, text, text, int, boolean), admin_guardar_cliente(uuid, text, text, text, text, text) to authenticated;