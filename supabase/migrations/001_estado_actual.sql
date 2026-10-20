-- 001 · Estado actual (línea base)
-- Reproduce lo que ya está desplegado + lo de mejoras.sql. Es seguro correrlo sobre la base actual: NO borra datos.
-- Regla: cada migración se corre UNA sola vez y en orden (001 → 002 → ...).

create table if not exists canchas (id int primary key, nombre text not null, tipo text not null, precio int not null);

create table if not exists reservas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  fecha date not null,
  hora int not null check (hora between 0 and 23),
  cancha_id int not null references canchas(id),
  nombre text not null, apellido text not null, telefono text not null, email text not null,
  precio int not null,
  created_at timestamptz default now(),
  unique (fecha, hora, cancha_id)
);

create table if not exists torneos (
  id serial primary key, titulo text not null, fecha date not null, hora text, lugar text,
  categorias text[] not null, precio int not null, cupos int not null,
  descripcion text, formato text, premios text[], reglamento text[], imagen text
);
alter table torneos add column if not exists imagen text;

create table if not exists inscripciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  torneo_id int not null references torneos(id),
  categoria text not null,
  jugador1 text not null, jugador2 text not null, telefono text not null, email text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','pagada','cancelada')),
  created_at timestamptz default now()
);

create table if not exists profesores (
  id serial primary key, nombre text not null, especialidad text not null, bio text,
  precio int not null, duracion int not null default 60, foto text,
  horarios jsonb not null, etiquetas text[]
);
alter table profesores add column if not exists etiquetas text[];

create table if not exists clases (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  profesor_id int not null references profesores(id),
  fecha date not null, hora int not null,
  nombre text not null, telefono text not null, email text not null,
  email_enviado boolean not null default false,
  created_at timestamptz default now(),
  unique (profesor_id, fecha, hora)
);

create table if not exists avisos (
  id serial primary key,
  tipo text not null check (tipo in ('urgente','info','torneo')),
  titulo text not null, texto text not null, enlace text,
  activo boolean not null default true,
  fecha date not null default current_date
);

-- Seguridad por filas (RLS): sin políticas = nadie accede directo; solo por las funciones de abajo.
alter table canchas enable row level security;
alter table reservas enable row level security;
alter table torneos enable row level security;
alter table inscripciones enable row level security;
alter table profesores enable row level security;
alter table clases enable row level security;
alter table avisos enable row level security;

drop policy if exists "canchas públicas" on canchas;
create policy "canchas públicas" on canchas for select using (true);
drop policy if exists "torneos públicos" on torneos;
create policy "torneos públicos" on torneos for select using (true);
drop policy if exists "profesores públicos" on profesores;
create policy "profesores públicos" on profesores for select using (true);
drop policy if exists "avisos activos" on avisos;
create policy "avisos activos" on avisos for select using (activo);

-- Vista pública de torneos con cantidad de inscriptos (sin datos personales)
drop view if exists torneos_info;
create view torneos_info as
  select t.*, (select count(*)::int from inscripciones i where i.torneo_id = t.id and i.estado <> 'cancelada') as inscriptos
  from torneos t;

-- Funciones (versión actual)
create or replace function ocupados(p_fecha date) returns table(hora int, cancha_id int)
language sql security definer set search_path = public as
$$ select hora, cancha_id from reservas where fecha = p_fecha $$;

create or replace function crear_reserva(p_fecha date, p_hora int, p_cancha int, p_nombre text, p_apellido text,
  p_telefono text, p_email text, p_precio int) returns text
language plpgsql security definer set search_path = public as $$
declare cod text := upper(substr(md5(random()::text), 1, 6));
begin
  if p_fecha < current_date then raise exception 'No se puede reservar en una fecha pasada.'; end if;
  insert into reservas(codigo, fecha, hora, cancha_id, nombre, apellido, telefono, email, precio)
  values (cod, p_fecha, p_hora, p_cancha, p_nombre, p_apellido, p_telefono, p_email,
          (select precio from canchas where id = p_cancha));
  return cod;
exception when unique_violation then
  raise exception 'Ese turno ya fue reservado. Elegí otro.';
end $$;

create or replace function inscribir(p_torneo int, p_categoria text, p_j1 text, p_j2 text, p_tel text, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare t torneos; n int; cod text := upper(substr(md5(random()::text), 1, 6));
begin
  select * into t from torneos where id = p_torneo for update;
  if not found then raise exception 'El torneo no existe.'; end if;
  select count(*) into n from inscripciones where torneo_id = p_torneo and estado <> 'cancelada';
  if n >= t.cupos then raise exception 'Los cupos de este torneo están completos.'; end if;
  insert into inscripciones(codigo, torneo_id, categoria, jugador1, jugador2, telefono, email)
  values (cod, p_torneo, p_categoria, p_j1, p_j2, p_tel, p_email);
  return cod;
end $$;

create or replace function clases_ocupadas(p_prof int, p_fecha date) returns table(hora int)
language sql security definer set search_path = public as
$$ select hora from clases where profesor_id = p_prof and fecha = p_fecha $$;

create or replace function reservar_clase(p_prof int, p_fecha date, p_hora int, p_nombre text, p_telefono text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare cod text := upper(substr(md5(random()::text), 1, 6)); p profesores;
begin
  if p_fecha < current_date then raise exception 'No se puede reservar en una fecha pasada.'; end if;
  select * into p from profesores where id = p_prof;
  if not found then raise exception 'El profesor no existe.'; end if;
  if not coalesce((p.horarios -> (extract(dow from p_fecha)::int)::text) @> to_jsonb(p_hora), false) then
    raise exception 'El profe no da clases en ese horario.';
  end if;
  insert into clases(codigo, profesor_id, fecha, hora, nombre, telefono, email)
  values (cod, p_prof, p_fecha, p_hora, p_nombre, p_telefono, p_email);
  return cod;
exception when unique_violation then
  raise exception 'Ese horario ya fue reservado. Elegí otro.';
end $$;

-- Permisos tal como los dejamos a mano en Supabase (002 los endurece)
grant usage on schema public to anon, authenticated;
grant select on canchas, torneos, profesores, avisos, torneos_info to anon, authenticated;
grant execute on function ocupados(date), crear_reserva(date,int,int,text,text,text,text,int), inscribir(int,text,text,text,text,text),
  clases_ocupadas(int,date), reservar_clase(int,date,int,text,text,text) to anon, authenticated;