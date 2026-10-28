
const SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND = Deno.env.get('RESEND_API_KEY')!;
const TO = Deno.env.get('MAIL_DESTINO')!;
const FROM = Deno.env.get('MAIL_FROM') ?? 'Padel Arena <onboarding@resend.dev>';
const LOGO = Deno.env.get('LOGO_URL') ?? ''; // PNG público (Gmail no muestra SVG). Opcional.
const PUBLIC_URL = (Deno.env.get('PUBLIC_URL') ?? '').replace(/\/$/, '');
const A_CLIENTES = Deno.env.get('ENVIAR_A_CLIENTES') === 'true';
const PAGO_ALIAS = Deno.env.get('PAGO_ALIAS') ?? '';
const PAGO_TITULAR = Deno.env.get('PAGO_TITULAR') ?? '';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const pad = (h: unknown) => String(h).padStart(2, '0') + ':00';
const money = (n: unknown) => '$' + Number(n ?? 0).toLocaleString('es-AR');
const waLink = (tel: string) => { const d = String(tel ?? '').replace(/\D/g, ''); return 'https://wa.me/' + (d.length === 10 ? '549' + d : d); };

// Qué tabla consulta cada tipo, y qué marcador evita mandar dos veces el mismo mail
const TIPOS: Record<string, { tabla: string; select: string; flag: string; extra?: string }> = {
  clase: { tabla: 'clases', select: '*,profesores(nombre,especialidad,precio,duracion)', flag: 'email_enviado' },
  reserva: { tabla: 'reservas', select: '*,canchas(nombre,tipo)', flag: 'email_enviado' },
  inscripcion: { tabla: 'inscripciones', select: '*,torneos(titulo,fecha,hora,lugar,precio)', flag: 'email_enviado' },
  cancelacion: { tabla: 'reservas', select: '*,canchas(nombre,tipo)', flag: 'email_cancelacion_enviado', extra: 'estado=eq.cancelada' },
};

// Arma los datos del mail según el tipo. "cliente" = true para la versión que recibe quien reservó.
const datos = (tipo: string, c: any, cliente: boolean) => {
  if (tipo === 'clase') {
    const p = c.profesores;
    return {
      etiqueta: cliente ? 'TU CLASE ESTÁ RESERVADA' : 'NUEVA CLASE RESERVADA', fecha: c.fecha, hora: pad(c.hora), sub: `con ${p.nombre}`,
      filas: [['Profesor', p.nombre], ['Especialidad', p.especialidad], ['Duración', p.duracion + ' min'], ['Valor', money(p.precio)], ['Código', c.codigo]],
      persona: { nombre: c.nombre, tel: c.telefono, email: c.email },
      asunto: cliente ? `Tu clase con ${p.nombre} está reservada` : `Nueva clase reservada · ${p.nombre}`,
      texto: `${c.nombre} reservó una clase con ${p.nombre} el ${c.fecha} a las ${pad(c.hora)} hs. Tel: ${c.telefono}. Código ${c.codigo}.`,
    };
  }
  if (tipo === 'inscripcion') {
    const t = c.torneos;
    return {
      etiqueta: cliente ? 'TU INSCRIPCIÓN FUE RECIBIDA' : 'NUEVA INSCRIPCIÓN A TORNEO', fecha: t.fecha, hora: String(t.hora ?? '').slice(0, 5) + ' hs', sub: t.titulo,
      filas: [['Torneo', t.titulo], ['Categoría', c.categoria], ['Pareja', `${c.jugador1} y ${c.jugador2}`], ['Lugar', t.lugar], ['Inscripción', money(t.precio) + ' por pareja'], ['Estado', 'Pendiente de pago'], ['Código', c.codigo]],
      persona: { nombre: `${c.jugador1} y ${c.jugador2}`, tel: c.telefono, email: c.email },
      asunto: cliente ? `Recibimos tu inscripción a ${t.titulo}` : `Nueva inscripción · ${t.titulo} · ${c.categoria}`,
      aviso: cliente && PAGO_ALIAS ? `Para confirmar tu lugar, transferí ${money(t.precio)} al alias ${PAGO_ALIAS}${PAGO_TITULAR ? ' (titular: ' + PAGO_TITULAR + ')' : ''} y mandanos el comprobante por WhatsApp.` : '',
      texto: `${c.jugador1} y ${c.jugador2} se inscribieron a ${t.titulo} (${c.categoria}). Tel: ${c.telefono}. Código ${c.codigo}.`,
    };
  }
  // reserva y cancelacion comparten datos
  const k = c.canchas, canc = tipo === 'cancelacion';
  return {
    etiqueta: canc ? (cliente ? 'TU RESERVA FUE CANCELADA' : 'RESERVA CANCELADA POR EL CLIENTE') : (cliente ? 'TU RESERVA ESTÁ CONFIRMADA' : 'NUEVA RESERVA DE CANCHA'),
    fecha: c.fecha, hora: pad(c.hora), sub: `${k.nombre} · ${k.tipo}`,
    filas: [['Cancha', k.nombre], ['Tipo', k.tipo], ['Duración', '60 min'], ['Precio', money(c.precio)], ['Código', c.codigo]],
    persona: { nombre: `${c.nombre} ${c.apellido ?? ''}`.trim(), tel: c.telefono, email: c.email },
    asunto: canc ? `Reserva cancelada · ${c.fecha} ${pad(c.hora)} · ${k.nombre}` : cliente ? `Tu reserva en Padel Arena · ${c.fecha} ${pad(c.hora)}` : `Nueva reserva · ${c.fecha} ${pad(c.hora)} · ${k.nombre}`,
    boton: cliente && PUBLIC_URL ? { texto: canc ? 'Hacer una nueva reserva' : 'Ver o cancelar mi reserva', url: canc ? PUBLIC_URL + '/index.html#reservas' : `${PUBLIC_URL}/reserva.html?codigo=${c.codigo}` } : null,
    aviso: canc && !cliente ? 'El turno quedó libre. Si la reserva tenía pagos registrados, revisá si corresponde un reembolso en el panel.' : '',
    texto: `${canc ? 'Cancelada' : 'Reserva'}: ${c.nombre} · ${c.fecha} ${pad(c.hora)} · ${k.nombre}. Tel: ${c.telefono}. Código ${c.codigo}.`,
  };
};

const plantilla = (d: any, cliente: boolean) => {
  const fecha = new Date(d.fecha + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fila = (k: string, v: string) =>
    `<tr><td style="padding:13px 0;border-bottom:1px solid #e6ebf5;color:#6b7a99;font-size:14px">${esc(k)}</td><td align="right" style="padding:13px 0;border-bottom:1px solid #e6ebf5;color:#07122e;font-size:14px;font-weight:700">${esc(v)}</td></tr>`;
  const logo = LOGO ? `<img src="${esc(LOGO)}" width="40" height="40" alt="" style="vertical-align:middle;margin-right:10px;border:0">` : '';
  const boton = d.boton ?? (!cliente && d.persona.tel ? { texto: 'Escribirle por WhatsApp', url: waLink(d.persona.tel) } : null);
  const bloquePersona = cliente ? '' : `<tr><td style="padding:14px 32px 6px"><div style="background:#f3f6fd;border-radius:14px;padding:18px 20px">
   <div style="color:#6b7a99;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px">CLIENTE</div>
   <div style="color:#07122e;font-size:17px;font-weight:700">${esc(d.persona.nombre)}</div>
   <div style="color:#41507a;font-size:14px;margin-top:4px">${esc(d.persona.tel)} · ${esc(d.persona.email)}</div></div></td></tr>`;
  const bloqueAviso = d.aviso ? `<tr><td style="padding:14px 32px 0"><div style="background:#fff8e6;border:1px solid #f5d98b;border-radius:14px;padding:14px 18px;color:#5c4a12;font-size:14px;line-height:1.5">${esc(d.aviso)}</div></td></tr>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#07122e">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(d.etiqueta)} · ${esc(fecha)} ${esc(d.hora)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07122e"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td align="center" style="padding-bottom:22px">${logo}<span style="font-family:'Arial Black',Impact,Arial,sans-serif;font-style:italic;font-size:24px;letter-spacing:1px;color:#ffffff;vertical-align:middle">PADEL <span style="color:#c6f432">ARENA</span></span></td></tr>
<tr><td style="background:#ffffff;border-radius:22px;overflow:hidden;font-family:Helvetica,Arial,sans-serif">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#0b1f4d;background-image:linear-gradient(135deg,#0b1f4d,#2563ff);padding:34px 32px">
  <div style="color:#c6f432;font-size:12px;font-weight:700;letter-spacing:2px">${esc(d.etiqueta)}</div>
  <div style="color:#ffffff;font-size:26px;font-weight:800;margin-top:10px;text-transform:capitalize">${esc(fecha)}</div>
  <div style="color:#ffffff;font-size:50px;font-weight:800;line-height:1.1;margin-top:2px">${esc(d.hora)}</div>
  <div style="color:#b9c6e6;font-size:15px;margin-top:8px">${esc(d.sub)}</div>
 </td></tr>
 <tr><td style="padding:26px 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${d.filas.map(([k, v]: string[]) => fila(k, v)).join('')}</table></td></tr>
 ${bloquePersona}${bloqueAviso}
 ${boton ? `<tr><td align="center" style="padding:22px 32px 34px"><a href="${esc(boton.url)}" style="display:inline-block;background:#c6f432;color:#07122e;font-weight:800;font-size:15px;text-decoration:none;padding:15px 30px;border-radius:99px">${esc(boton.texto)}</a></td></tr>` : '<tr><td style="padding:16px"></td></tr>'}
 </table>
</td></tr>
<tr><td align="center" style="padding:20px 10px;font-family:Helvetica,Arial,sans-serif;color:#7d8db3;font-size:12px">Mail automático de Padel Arena · proyecto demo</td></tr>
</table></td></tr></table></body></html>`;
};

const mandar = (to: string, subject: string, html: string, text: string) =>
  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const codigo = body?.codigo;
    const tipo = body?.tipo && TIPOS[body.tipo] ? body.tipo : 'clase'; // sin tipo = clase (compatible con la web anterior)
    if (!/^[A-Z0-9]{6}$/.test(codigo ?? '')) return json({ error: 'Código inválido' }, 400);
    const t = TIPOS[tipo];
    const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
    const url = `${SB}/rest/v1/${t.tabla}?codigo=eq.${codigo}&${t.flag}=eq.false${t.extra ? '&' + t.extra : ''}&select=${t.select}`;
    const r = await fetch(url, { headers: h });
    const [c] = await r.json();
    if (!c) return json({ ok: true, omitido: true }); // no existe o ya se envió

    // 1) aviso al dueño (si falla, no se marca como enviado y se puede reintentar)
    const dOwner = datos(tipo, c, false);
    const res = await mandar(TO, dOwner.asunto, plantilla(dOwner, false), dOwner.texto);
    if (!res.ok) return json({ error: await res.text() }, 502);
    await fetch(`${SB}/rest/v1/${t.tabla}?id=eq.${c.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ [t.flag]: true }) });

    // 2) confirmación al cliente (opcional, "mejor esfuerzo": un fallo acá no afecta nada)
    let alCliente = false;
    if (A_CLIENTES && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email ?? '')) {
      try {
        const dCli = datos(tipo, c, true);
        alCliente = (await mandar(c.email, dCli.asunto, plantilla(dCli, true), dCli.texto)).ok;
      } catch (_) { /* se ignora */ }
    }
    return json({ ok: true, cliente: alCliente });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});