/* Pegá los datos de tu proyecto: Supabase → Project Settings → API.
   Si queda vacío, la web funciona en modo local (localStorage).
   Usá la clave "anon" / "publishable". NUNCA la "service_role". */
const SUPABASE_URL = 'https://dibxatuqcqzacoxcbmli.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6rbeSiMalf4jcZM_jRKA0Q_ySyEqDnB';
const db = (SUPABASE_URL && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;