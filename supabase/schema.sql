-- Pegar completo en Supabase → SQL Editor → Run

create table canchas (id int primary key, nombre text not null, tipo text not null, precio int not null);

create table reservas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  fecha date not null,
  hora int not null check (hora between 0 and 23),
  cancha_id int not null references canchas(id),
  nombre text not null, apellido text not null, telefono text not null, email text not null,
  precio int not null,
  created_at timestamptz default now(),
  unique (fecha, hora, cancha_id)          -- imposible reservar dos veces el mismo turno
);

create table torneos (
  id serial primary key, titulo text not null, fecha date not null, hora text, lugar text,
  categorias text[] not null, precio int not null, cupos int not null,
  descripcion text, formato text, premios text[], reglamento text[]
);

create table inscripciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  torneo_id int not null references torneos(id),
  categoria text not null,
  jugador1 text not null, jugador2 text not null, telefono text not null, email text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','pagada','cancelada')),
  created_at timestamptz default now()
);

-- Seguridad (RLS): el público NO puede leer ni escribir reservas/inscripciones directamente.
alter table canchas enable row level security;
alter table reservas enable row level security;
alter table torneos enable row level security;
alter table inscripciones enable row level security;
create policy "canchas públicas" on canchas for select using (true);
create policy "torneos públicos" on torneos for select using (true);

-- Vista pública de torneos con cantidad de inscriptos (sin datos personales)
create view torneos_info as
  select t.*, (select count(*)::int from inscripciones i where i.torneo_id = t.id and i.estado <> 'cancelada') as inscriptos
  from torneos t;
grant select on torneos_info to anon, authenticated;

-- Qué turnos están ocupados (solo hora y cancha, sin datos de las personas)
create function ocupados(p_fecha date) returns table(hora int, cancha_id int)
language sql security definer set search_path = public as
$$ select hora, cancha_id from reservas where fecha = p_fecha $$;

create function crear_reserva(p_fecha date, p_hora int, p_cancha int, p_nombre text, p_apellido text,
  p_telefono text, p_email text, p_precio int) returns text
language plpgsql security definer set search_path = public as $$
declare cod text := upper(substr(md5(random()::text), 1, 6));
begin
  if p_fecha < current_date then raise exception 'No se puede reservar en una fecha pasada.'; end if;
  insert into reservas(codigo, fecha, hora, cancha_id, nombre, apellido, telefono, email, precio)
  values (cod, p_fecha, p_hora, p_cancha, p_nombre, p_apellido, p_telefono, p_email,
          (select precio from canchas where id = p_cancha));  -- el precio lo decide la base, no el navegador
  return cod;
exception when unique_violation then
  raise exception 'Ese turno ya fue reservado. Elegí otro.';
end $$;

create function inscribir(p_torneo int, p_categoria text, p_j1 text, p_j2 text, p_tel text, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare t torneos; n int; cod text := upper(substr(md5(random()::text), 1, 6));
begin
  select * into t from torneos where id = p_torneo for update;   -- bloquea para que no se pasen los cupos
  if not found then raise exception 'El torneo no existe.'; end if;
  select count(*) into n from inscripciones where torneo_id = p_torneo and estado <> 'cancelada';
  if n >= t.cupos then raise exception 'Los cupos de este torneo están completos.'; end if;
  insert into inscripciones(codigo, torneo_id, categoria, jugador1, jugador2, telefono, email)
  values (cod, p_torneo, p_categoria, p_j1, p_j2, p_tel, p_email);
  return cod;
end $$;

-- Datos de ejemplo
insert into canchas values (1,'Cancha 1','Panorámica',18000),(2,'Cancha 2','Panorámica',18000),(3,'Cancha 3','Indoor',20000),(4,'Cancha 4','Indoor',20000);
insert into torneos (titulo, fecha, hora, lugar, categorias, precio, cupos, descripcion, formato, premios, reglamento) values
('Torneo Amateur','2026-10-24','09:00','Padel Arena · Canchas 1 a 4','{6ta,7ma,8va}',24000,16,'El torneo amateur del año.','Fase de grupos y eliminación directa.','{"Trofeo + kit de paletas","Trofeo + vouchers de clases","Medallas + 2 tubos de pelotas"}','{"Parejas fijas","Mejor de 3 sets","Tolerancia de 10 minutos","Inscripción confirmada al acreditar el pago"}'),
('Americano Mixto','2026-11-01','16:00','Padel Arena · Canchas 1 y 2','{"Mixto libre"}',12000,24,'Parejas rotativas, todos los niveles.','Parejas rotativas con puntos individuales.','{"Premio sorpresa del bar","Voucher de alquiler de paletas","Tubo de pelotas"}','{"Sorteo de parejas en cada ronda","Rondas de 20 minutos"}'),
('Clínica con profesores','2026-11-14','10:00','Padel Arena · Cancha 3 (indoor)','{"Todos los niveles"}',15000,12,'Volea, bandeja y salida de pared.','Clase intensiva de 3 horas con video análisis.','{"Certificado de participación","Descuento en clases grupales","Sorteo de una paleta"}','{"Traé tu paleta o alquilá en el mostrador"}');