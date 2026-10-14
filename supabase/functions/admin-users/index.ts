// Edge Function: gestión de cuentas por el superadministrador.
// Acciones: create (correo + contraseña temporal + permiso), reset (nueva contraseña temporal), delete.
// La clave de servicio (SUPABASE_SERVICE_ROLE_KEY) vive solo aquí, nunca en el navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Sesión no válida." }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await admin.from("user_roles").select("role, must_change_password").eq("user_id", user.id).maybeSingle();
  if (!me || me.role !== "super_admin" || me.must_change_password) {
    return json({ error: "Solo el superadministrador puede administrar cuentas." }, 403);
  }

  let body: { action?: string; email?: string; password?: string; role?: string; userId?: string };
  try { body = await req.json(); } catch { return json({ error: "Solicitud no válida." }, 400); }

  const validPassword = (p?: string) => typeof p === "string" && p.length >= 8 && p.length <= 72;

  if (body.action === "create") {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) return json({ error: "El correo no es válido." }, 400);
    if (!validPassword(body.password)) return json({ error: "La contraseña temporal debe tener entre 8 y 72 caracteres." }, 400);
    if (!["admin", "editor", "viewer"].includes(body.role ?? "")) return json({ error: "Permiso no válido." }, 400);

    const { data, error } = await admin.auth.admin.createUser({ email, password: body.password!, email_confirm: true });
    if (error || !data.user) {
      const dup = /already|registered|exists/i.test(error?.message ?? "");
      return json({ error: dup ? "Ya existe una cuenta con ese correo." : "No se pudo crear la cuenta." }, dup ? 409 : 400);
    }
    // El trigger crea la fila como "pending"; aquí se fija el permiso y el cambio obligatorio.
    const { error: e2 } = await admin.from("user_roles").upsert({ user_id: data.user.id, role: body.role, must_change_password: true }, { onConflict: "user_id" });
    if (e2) return json({ error: "La cuenta se creó pero no se pudo asignar el permiso." }, 500);
    return json({ ok: true, id: data.user.id, email });
  }

  if (body.action === "reset" || body.action === "delete") {
    const id = body.userId ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Cuenta no válida." }, 400);
    if (id === user.id) return json({ error: "No puedes modificar tu propia cuenta desde aquí." }, 400);
    const { data: target } = await admin.from("user_roles").select("role").eq("user_id", id).maybeSingle();
    if (target?.role === "super_admin") return json({ error: "La cuenta superadministradora está protegida." }, 403);

    if (body.action === "reset") {
      if (!validPassword(body.password)) return json({ error: "La contraseña temporal debe tener entre 8 y 72 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password: body.password! });
      if (error) return json({ error: "No se pudo restablecer la contraseña." }, 400);
      await admin.from("user_roles").update({ must_change_password: true }).eq("user_id", id);
      return json({ ok: true });
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: "No se pudo eliminar la cuenta." }, 400);
    return json({ ok: true });
  }

  return json({ error: "Acción no válida." }, 400);
});
