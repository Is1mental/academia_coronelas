// Edge Function: avisa por WhatsApp (Meta Cloud API) cuando entra una solicitud nueva.
// La dispara un trigger de la base de datos (ver supabase/migracion-whatsapp.sql) con { id }.
// Es idempotente: solo notifica filas con notified_at vacío, así que repetir la llamada no reenvía nada.
// Secretos (Supabase → Edge Functions → Secrets): WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, ADMIN_PHONE,
// opcionales: TPL_ADMIN, TPL_TUTOR, TPL_LANG.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Teléfono mexicano de 10 dígitos → 52XXXXXXXXXX. Devuelve null si no es utilizable.
function normalize(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) d = "52" + d;
  else if (d.length === 12 && d.startsWith("52")) { /* ok */ }
  else if (d.length === 13 && d.startsWith("521")) d = "52" + d.slice(3);
  else return null;
  return d;
}

async function sendTemplate(to: string, name: string, lang: string, params: string[]) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${Deno.env.get("WHATSAPP_PHONE_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: { name, language: { code: lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: (text || "-").slice(0, 200) })) }] },
    }),
  });
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  let id = "";
  try { id = (await req.json()).id ?? ""; } catch { /* vacío */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Solicitud no válida." }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Reclama la fila: solo una llamada puede pasar de notified_at null a fecha.
  const { data: row } = await db.from("enrollments").update({ notified_at: new Date().toISOString() }).eq("id", id).is("notified_at", null).select().maybeSingle();
  if (!row) return json({ ok: true, skipped: true });

  const lang = Deno.env.get("TPL_LANG") ?? "es_MX";
  const results: string[] = [];
  try {
    const admin = normalize(Deno.env.get("ADMIN_PHONE") ?? "");
    if (admin) {
      await sendTemplate(admin, Deno.env.get("TPL_ADMIN") ?? "solicitud_nueva_admin", lang,
        [row.player_name, `${row.age} años`, row.category || "Sin categoría", row.guardian, row.phone]);
      results.push("admin");
    }
    const tutor = normalize(row.phone);
    if (tutor) {
      await sendTemplate(tutor, Deno.env.get("TPL_TUTOR") ?? "solicitud_recibida", lang, [row.guardian_first || row.guardian, row.player_first || row.player_name]);
      results.push("tutor");
    }
  } catch (e) {
    console.error(String(e));
    return json({ ok: false, sent: results, error: String(e) }, 502);
  }
  return json({ ok: true, sent: results });
});
