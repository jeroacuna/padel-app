// Edge Function: avisa por email cuando se reserva una clase.
// La web solo manda el CÓDIGO de la reserva; los datos y el destinatario salen de la base y de los secrets,
// así nadie puede usar esta función para mandar mails a cualquiera.
const SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND = Deno.env.get('RESEND_API_KEY')!;
const TO = Deno.env.get('MAIL_DESTINO')!; // con onboarding@resend.dev tiene que ser el mail de tu cuenta de Resend
const FROM = Deno.env.get('MAIL_FROM') ?? 'Padel Arena <onboarding@resend.dev>';
const LOGO = Deno.env.get('LOGO_URL') ?? ''; // PNG público (Gmail no muestra SVG). Opcional.

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const plantilla = (c: any) => {
  const p = c.profesores;
  const fecha = new Date(c.fecha + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const hora = String(c.hora).padStart(2, '0') + ':00';
  const tel = String(c.telefono).replace(/\D/g, '');
  const wa = 'https://wa.me/' + (tel.length === 10 ? '549' + tel : tel);
  const fila = (k: string, v: string) =>
    `<tr><td style="padding:13px 0;border-bottom:1px solid #e6ebf5;color:#6b7a99;font-size:14px">${k}</td><td align="right" style="padding:13px 0;border-bottom:1px solid #e6ebf5;color:#07122e;font-size:14px;font-weight:700">${v}</td></tr>`;
  const logo = LOGO ? `<img src="${esc(LOGO)}" width="40" height="40" alt="" style="vertical-align:middle;margin-right:10px;border:0">` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#07122e">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.nombre)} reservó una clase con ${esc(p.nombre)} · ${esc(fecha)} ${hora} hs</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07122e"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td align="center" style="padding-bottom:22px">${logo}<span style="font-family:'Arial Black',Impact,Arial,sans-serif;font-style:italic;font-size:24px;letter-spacing:1px;color:#ffffff;vertical-align:middle">PADEL <span style="color:#c6f432">ARENA</span></span></td></tr>
<tr><td style="background:#ffffff;border-radius:22px;overflow:hidden;font-family:Helvetica,Arial,sans-serif">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#0b1f4d;background-image:linear-gradient(135deg,#0b1f4d,#2563ff);padding:34px 32px">
  <div style="color:#c6f432;font-size:12px;font-weight:700;letter-spacing:2px">NUEVA CLASE RESERVADA</div>
  <div style="color:#ffffff;font-size:26px;font-weight:800;margin-top:10px;text-transform:capitalize">${esc(fecha)}</div>
  <div style="color:#ffffff;font-size:50px;font-weight:800;line-height:1.1;margin-top:2px">${hora}<span style="font-size:20px;color:#c6f432"> hs</span></div>
  <div style="color:#b9c6e6;font-size:15px;margin-top:8px">con ${esc(p.nombre)}</div>
 </td></tr>
 <tr><td style="padding:26px 32px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
   ${fila('Profesor', esc(p.nombre))}${fila('Especialidad', esc(p.especialidad))}${fila('Duración', esc(p.duracion) + ' min')}${fila('Valor', '$' + Number(p.precio).toLocaleString('es-AR'))}${fila('Código', esc(c.codigo))}
  </table>
 </td></tr>
 <tr><td style="padding:14px 32px 6px">
  <div style="background:#f3f6fd;border-radius:14px;padding:18px 20px">
   <div style="color:#6b7a99;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px">ALUMNO</div>
   <div style="color:#07122e;font-size:17px;font-weight:700">${esc(c.nombre)}</div>
   <div style="color:#41507a;font-size:14px;margin-top:4px">${esc(c.telefono)} · ${esc(c.email)}</div>
  </div>
 </td></tr>
 <tr><td align="center" style="padding:22px 32px 34px">
  <a href="${esc(wa)}" style="display:inline-block;background:#c6f432;color:#07122e;font-weight:800;font-size:15px;text-decoration:none;padding:15px 30px;border-radius:99px">Escribirle por WhatsApp</a>
 </td></tr></table>
</td></tr>
<tr><td align="center" style="padding:20px 10px;font-family:Helvetica,Arial,sans-serif;color:#7d8db3;font-size:12px">Mail automático de Padel Arena · proyecto demo</td></tr>
</table></td></tr></table></body></html>`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { codigo } = await req.json();
    if (!/^[A-Z0-9]{6}$/.test(codigo ?? '')) return json({ error: 'Código inválido' }, 400);
    const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
    const r = await fetch(`${SB}/rest/v1/clases?codigo=eq.${codigo}&email_enviado=eq.false&select=*,profesores(nombre,especialidad,precio,duracion)`, { headers: h });
    const [c] = await r.json();
    if (!c) return json({ ok: true, omitido: true }); // no existe o ya se envió

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [TO], subject: `Nueva clase reservada · ${c.profesores.nombre}`, html: plantilla(c),
        text: `${c.nombre} reservó una clase con ${c.profesores.nombre} el ${c.fecha} a las ${c.hora}:00 hs. Tel: ${c.telefono}. Código ${c.codigo}.`,
      }),
    });
    if (!res.ok) return json({ error: await res.text() }, 502);
    await fetch(`${SB}/rest/v1/clases?id=eq.${c.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ email_enviado: true }) });
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});