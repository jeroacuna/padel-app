
insert into perfiles_admin (user_id, nombre, rol)
values ('PEGAR-ACA-EL-UID', 'Jeronimo', 'owner')
on conflict (user_id) do update set nombre = excluded.nombre, rol = excluded.rol, activo = true;