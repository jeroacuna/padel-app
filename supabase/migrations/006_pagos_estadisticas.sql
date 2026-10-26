create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id),
  tipo text not null check (tipo in ('cobro', 'reembolso')),
  monto int not null check (monto between 1 and 1000000),
  metodo text not null check (metodo in ('efectivo', 'transferencia', 'tarjeta', 'mercadopago', 'otro')),
  proveedor text not null default 'manual',           -- hoy 'manual'; mañana 'mercadopago'
  referencia text, nota text,                          -- referencia: nº de transferencia o id del pago externo
  fecha date not null,                                 -- día del cobro en hora argentina
  anulado boolean not null default false, anulado_motivo text, anulado_por uuid, anulado_el timestamptz,
  registrado_por uuid, quien text, created_at timestamptz not null default now()
);
create index if not exists pagos_reserva_idx on pagos (reserva_id);
create index if not exists pagos_fecha_idx on pagos (fecha);
alter table pagos enable row level security;
drop policy if exists "admins ven pagos" on pagos;
create policy "admins ven pagos" on pagos for select to authenticated using (es_admin());
revoke all on pagos from anon, authenticated;
grant select on pagos to authenticated;

-- Dinero cobrado neto de una reserva (cobros menos reembolsos, sin contar los anulados)
create or replace function neto_cobrado(p_reserva uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when tipo = 'cobro' then monto else -monto end), 0)::int from pagos where reserva_id = p_reserva and not anulado
$$;

-- El estado de pago de la reserva se calcula solo a partir de los pagos
create or replace function recalcular_pago(p_reserva uuid) returns text language plpgsql security definer set search_path = public as $$
declare r reservas; neto int; hubo_reembolso boolean; nuevo text;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found then return null; end if;
  neto := neto_cobrado(p_reserva);
  select exists (select 1 from pagos where reserva_id = p_reserva and tipo = 'reembolso' and not anulado) into hubo_reembolso;
  nuevo := case when r.precio = 0 then 'pagado' when neto <= 0 and hubo_reembolso then 'reembolsado' when neto <= 0 then 'pendiente'
                when neto < r.precio then 'parcial' else 'pagado' end;
  update reservas set pago_estado = nuevo, updated_at = now() where id = p_reserva;
  return nuevo;
end $$;

create or replace function admin_registrar_pago(p_reserva uuid, p_monto int, p_metodo text, p_tipo text default 'cobro',
  p_referencia text default null, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; neto int; pid uuid; est text; neto_final int;
begin
  perform exigir_admin();
  if p_tipo not in ('cobro', 'reembolso') then raise exception 'Tipo de movimiento inválido.'; end if;
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'mercadopago', 'otro') then raise exception 'Método de pago inválido.'; end if;
  if p_monto is null or p_monto not between 1 and 1000000 then raise exception 'El monto debe ser mayor a 0.'; end if;
  select * into r from reservas where id = p_reserva for update;
  if not found then raise exception 'La reserva no existe.'; end if;
  neto := neto_cobrado(p_reserva);
  if p_tipo = 'cobro' then
    if r.estado = 'cancelada' then raise exception 'No se puede cobrar una reserva cancelada.'; end if;
    if neto + p_monto > r.precio then raise exception 'El monto supera el saldo pendiente ($%).', r.precio - neto; end if;
  elsif p_monto > neto then
    raise exception 'No se puede reembolsar más de lo cobrado ($%).', neto;
  end if;
  insert into pagos (reserva_id, tipo, monto, metodo, referencia, nota, fecha, registrado_por, quien)
  values (p_reserva, p_tipo, p_monto, p_metodo, left(nullif(btrim(coalesce(p_referencia, '')), ''), 100), left(nullif(btrim(coalesce(p_nota, '')), ''), 300),
          ahora_ar()::date, auth.uid(), (select nombre from perfiles_admin where user_id = auth.uid()))
  returning id into pid;
  est := recalcular_pago(p_reserva);
  neto_final := neto_cobrado(p_reserva);
  perform registrar_auditoria('reservas', p_reserva::text, 'pago_' || p_tipo, jsonb_build_object('monto', p_monto, 'metodo', p_metodo));
  return jsonb_build_object('id', pid, 'cobrado', neto_final, 'saldo', r.precio - neto_final, 'pago_estado', est);
end $$;

-- Anular un movimiento (error de carga). Solo el propietario. No se borra: queda registrado quién y por qué.
create or replace function admin_anular_pago(p_pago uuid, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare p pagos; est text;
begin
  perform exigir_admin();
  if coalesce(rol_admin(), '') <> 'owner' then raise exception 'Solo el propietario puede anular pagos.'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then raise exception 'Escribí el motivo de la anulación (entre 3 y 200 caracteres).'; end if;
  select * into p from pagos where id = p_pago for update;
  if not found then raise exception 'El pago no existe.'; end if;
  if p.anulado then raise exception 'Ese pago ya estaba anulado.'; end if;
  update pagos set anulado = true, anulado_motivo = btrim(p_motivo), anulado_por = auth.uid(), anulado_el = now() where id = p_pago;
  if neto_cobrado(p.reserva_id) < 0 then raise exception 'Primero anulá los reembolsos de esta reserva.'; end if;
  est := recalcular_pago(p.reserva_id);
  perform registrar_auditoria('reservas', p.reserva_id::text, 'anular_pago', jsonb_build_object('monto', p.monto, 'tipo', p.tipo, 'motivo', btrim(p_motivo)));
  return est;
end $$;

-- Reservas con su saldo (security_invoker: solo los administradores ven filas)
drop view if exists reservas_saldo;
create view reservas_saldo with (security_invoker = true) as
  select r.id, r.codigo, r.fecha, r.hora, r.cancha_id, r.nombre, r.apellido, r.telefono, r.estado, r.pago_estado, r.precio,
         coalesce(p.neto, 0)::int as cobrado, (r.precio - coalesce(p.neto, 0))::int as saldo
  from reservas r
  left join lateral (select sum(case when tipo = 'cobro' then monto else -monto end) as neto from pagos where reserva_id = r.id and not anulado) p on true;

-- Resumen financiero de un período: cobrado (caja) vs reservado vs por cobrar
create or replace function admin_resumen_finanzas(p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cobros int; reembolsos int; reservado int; pendiente int; pd jsonb; pm jsonb; pc jsonb;
begin
  perform exigir_admin();
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then raise exception 'Rango de fechas inválido.'; end if;
  select coalesce(sum(monto) filter (where tipo = 'cobro'), 0), coalesce(sum(monto) filter (where tipo = 'reembolso'), 0) into cobros, reembolsos
    from pagos where not anulado and fecha between p_desde and p_hasta;
  select coalesce(sum(precio), 0) into reservado from reservas where estado <> 'cancelada' and fecha between p_desde and p_hasta;
  select coalesce(sum(greatest(saldo, 0)), 0) into pendiente from reservas_saldo where estado <> 'cancelada' and fecha between p_desde and p_hasta;
  select coalesce(jsonb_agg(jsonb_build_object('fecha', f, 'monto', m) order by f), '[]') into pd from
    (select fecha as f, sum(case when tipo = 'cobro' then monto else -monto end) as m from pagos where not anulado and fecha between p_desde and p_hasta group by fecha) x;
  select coalesce(jsonb_agg(jsonb_build_object('metodo', k, 'monto', m) order by m desc), '[]') into pm from
    (select metodo as k, sum(case when tipo = 'cobro' then monto else -monto end) as m from pagos where not anulado and fecha between p_desde and p_hasta group by metodo) x;
  select coalesce(jsonb_agg(jsonb_build_object('cancha', k, 'monto', m) order by m desc), '[]') into pc from
    (select c.nombre as k, sum(case when p.tipo = 'cobro' then p.monto else -p.monto end) as m
       from pagos p join reservas r on r.id = p.reserva_id join canchas c on c.id = r.cancha_id
      where not p.anulado and p.fecha between p_desde and p_hasta group by c.nombre) x;
  return jsonb_build_object('cobrado', cobros - reembolsos, 'cobros', cobros, 'reembolsos', reembolsos, 'reservado', reservado,
                            'pendiente', pendiente, 'por_dia', pd, 'por_metodo', pm, 'por_cancha', pc);
end $$;

-- Estadísticas de uso de un período
create or replace function admin_estadisticas(p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare dias int; activas int; h_ini int; h_fin int; total int; canc int; ph jsonb; pw jsonb; pc jsonb;
begin
  perform exigir_admin();
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then raise exception 'Rango de fechas inválido.'; end if;
  dias := p_hasta - p_desde + 1;
  select count(*) into activas from canchas where activa;
  select coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_inicio'), 9),
         coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_fin'), 22) into h_ini, h_fin;
  select count(*) filter (where estado <> 'cancelada'), count(*) filter (where estado = 'cancelada') into total, canc
    from reservas where fecha between p_desde and p_hasta;
  select coalesce(jsonb_agg(jsonb_build_object('hora', hora, 'reservas', n) order by hora), '[]') into ph from
    (select hora, count(*) as n from reservas where estado <> 'cancelada' and fecha between p_desde and p_hasta group by hora) x;
  select coalesce(jsonb_agg(jsonb_build_object('dia', d, 'reservas', n) order by d), '[]') into pw from
    (select extract(dow from fecha)::int as d, count(*) as n from reservas where estado <> 'cancelada' and fecha between p_desde and p_hasta group by 1) x;
  select coalesce(jsonb_agg(jsonb_build_object('cancha', k, 'reservas', n, 'ocupacion', round(100.0 * n / greatest((h_fin - h_ini + 1) * dias, 1))) order by n desc), '[]') into pc from
    (select c.nombre as k, count(*) as n from reservas r join canchas c on c.id = r.cancha_id where r.estado <> 'cancelada' and r.fecha between p_desde and p_hasta group by c.nombre) x;
  return jsonb_build_object('reservas', total, 'canceladas', canc,
    'ocupacion', round(100.0 * total / greatest(activas * (h_fin - h_ini + 1) * dias, 1)),
    'tasa_cancelacion', round(100.0 * canc / greatest(total + canc, 1)), 'dias', dias,
    'por_hora', ph, 'por_dia_semana', pw, 'por_cancha', pc);
end $$;

revoke all on reservas_saldo from anon, authenticated;
grant select on reservas_saldo to authenticated;
revoke execute on function neto_cobrado(uuid), recalcular_pago(uuid), admin_registrar_pago(uuid, int, text, text, text, text), admin_anular_pago(uuid, text),
  admin_resumen_finanzas(date, date), admin_estadisticas(date, date) from public, anon, authenticated;
grant execute on function admin_registrar_pago(uuid, int, text, text, text, text), admin_anular_pago(uuid, text),
  admin_resumen_finanzas(date, date), admin_estadisticas(date, date) to authenticated;