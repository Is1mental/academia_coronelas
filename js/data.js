// Capa de datos compartida por el sitio y el panel.
// Con credenciales en config.js usa Supabase; sin ellas, MODO DEMOSTRACIÓN (localStorage).
(() => {
  const cfg = window.ACADEMIA_CONFIG || {};
  const remote = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = remote ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  const P = "academia:";
  const lsGet = (k, d) => { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => {
    try { localStorage.setItem(P + k, JSON.stringify(v)); }
    catch { throw new Error("El almacenamiento del navegador está lleno. Usa menos o más pequeñas imágenes, o conecta Supabase."); }
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const fail = (error, msg) => { if (error) throw new Error(msg || error.message || "Error de conexión."); };

  const SEED = {
    categories: [
      ["Mini", "8 – 10 años", "Primer contacto con el balón, coordinación y juego en equipo.", false],
      ["Infantil", "11 – 12 años", "Fundamentos técnicos: pase, recepción, saque y colocación.", false],
      ["Cadete", "13 – 14 años", "Rotaciones, sistemas de juego y primera competencia formal.", false],
      ["Juvenil", "15 – 16 años", "Ataque, bloqueo y lectura táctica con enfoque competitivo.", false],
      ["Sub-18", "17 – 18 años", "Alto rendimiento y preparación para ligas superiores.", false],
      ["Selectivo Elite", "Por invitación", "Las jugadoras destacadas entrenan junto al cuerpo técnico del club.", true]
    ].map(([name, age, description, featured], i) => ({ name, age, description, featured, display_order: i, active: true })),
    schedules: [
      ["Mini / Infantil", "Lun · Mié · Vie", "4:00 – 5:30 pm"],
      ["Cadete", "Lun · Mié · Vie", "5:30 – 7:00 pm"],
      ["Juvenil / Sub-18", "Mar · Jue · Sáb", "6:00 – 8:00 pm"],
      ["Selectivo Elite", "Mar · Jue · Sáb", "8:00 – 9:30 pm"]
    ].map(([label, days, time], i) => ({ label, days, time, display_order: i, active: true })),
    faqs: [
      ["¿Necesito experiencia previa?", "No. Hay grupos para quienes empiezan desde cero y para quienes ya compiten."],
      ["¿Qué debo llevar a la clase de prueba?", "Ropa deportiva, rodilleras si las tienes, tenis de interior y agua."],
      ["¿Cuánto cuesta la mensualidad?", "Te compartimos costos al contactarte; incluyen entrenamiento y playera de la academia."],
      ["¿Habrá torneos?", "Sí, participamos en torneos locales y regionales durante el año."]
    ].map(([question, answer], i) => ({ question, answer, display_order: i, active: true }))
  };

  const orderKey = { enrollments: "created_at", pages: "display_order" };
  const order = (rows, key, asc) => rows.sort((a, b) => {
    const x = a[key] ?? 0, y = b[key] ?? 0;
    return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
  });

  async function list(table, { where = {}, orderBy, asc } = {}) {
    const key = orderBy || orderKey[table] || "display_order";
    const up = asc ?? (key !== "created_at");
    if (remote) {
      let q = sb.from(table).select("*");
      for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
      const { data, error } = await q.order(key, { ascending: up });
      fail(error, "No se pudo cargar la información.");
      return data || [];
    }
    const rows = lsGet("t:" + table, []).filter(r => Object.entries(where).every(([k, v]) => r[k] === v));
    return order(rows, key, up);
  }

  async function save(table, row) {
    const now = new Date().toISOString();
    if (table === "pages") row = { ...row, updated_at: now };
    if (remote) {
      const clean = { ...row };
      // Editar usa UPDATE (no upsert): el upsert también valida la política de INSERT y rechazaría, por ejemplo, cambiar el estado de una solicitud.
      let q;
      if (clean.id) { const id = clean.id; delete clean.id; delete clean.created_at; q = sb.from(table).update(clean).eq("id", id); }
      else { delete clean.id; q = sb.from(table).insert(clean); }
      const { data, error } = await q.select().single();
      fail(error, error && /duplicate|unique/i.test(error.message) ? "Ya existe un registro con ese identificador." : "No se pudo guardar. Revisa tus permisos.");
      return data;
    }
    const rows = lsGet("t:" + table, []);
    if (table === "pages" && rows.some(r => r.slug === row.slug && r.id !== row.id)) throw new Error("Ya existe una página con esa dirección.");
    const i = row.id ? rows.findIndex(r => r.id === row.id) : -1;
    const saved = i >= 0 ? { ...rows[i], ...row } : { created_at: now, ...row, id: row.id || uid() };
    if (i >= 0) rows[i] = saved; else rows.push(saved);
    lsSet("t:" + table, rows);
    return saved;
  }

  async function remove(table, id) {
    if (remote) { const { error } = await sb.from(table).delete().eq("id", id); fail(error, "No se pudo eliminar. Revisa tus permisos."); return; }
    lsSet("t:" + table, lsGet("t:" + table, []).filter(r => r.id !== id));
  }

  async function getSetting(key, fallback = {}) {
    if (remote) {
      const { data, error } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
      if (error) return fallback;
      return data ? { ...fallback, ...data.value } : fallback;
    }
    return { ...fallback, ...lsGet("s:" + key, {}) };
  }
  async function setSetting(key, value) {
    if (remote) { const { error } = await sb.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }); fail(error, "No se pudo guardar. Revisa tus permisos."); return; }
    lsSet("s:" + key, value);
  }

  async function submitEnrollment(row) {
    const clean = { player_name: row.player_name, player_first: row.player_first || "", player_paternal: row.player_paternal || "", player_maternal: row.player_maternal || "", age: row.age, category: row.category, guardian: row.guardian, guardian_first: row.guardian_first || "", guardian_paternal: row.guardian_paternal || "", guardian_maternal: row.guardian_maternal || "", phone: row.phone, status: "new", notes: "" };
    if (remote) { const { error } = await sb.from("enrollments").insert(clean); fail(error, "No se pudo enviar la solicitud. Intenta de nuevo."); return; }
    await save("enrollments", clean);
  }

  // Redimensiona en el navegador y sube. Solo JPG/PNG/WebP/AVIF.
  async function uploadImage(file, folder = "general") {
    if (!file || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
    if (file.size > 15 * 1024 * 1024) throw new Error("La imagen pesa más de 15 MB.");
    const max = remote ? 1800 : 1100;
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/webp", remote ? .86 : .7));
    if (!blob) throw new Error("No se pudo procesar la imagen.");
    if (remote) {
      const path = `${folder}/${uid()}.webp`;
      const { error } = await sb.storage.from("media").upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
      fail(error, "No se pudo subir la imagen. Revisa tus permisos.");
      return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    }
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }

  // ── Autenticación ──
  const auth = {
    demo: !remote,
    async user() {
      if (!remote) return lsGet("demo-user", null);
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user : null;
    },
    async role() {
      if (!remote) return "super_admin";
      const u = await auth.user();
      if (!u) return "none";
      const { data } = await sb.from("user_roles").select("role").eq("user_id", u.id).maybeSingle();
      return data ? data.role : "pending";
    },
    async signIn(email, password) {
      if (!remote) { lsSet("demo-user", { id: "demo", email }); return; }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      fail(error, "Correo o contraseña incorrectos.");
    },
    async signUp(email, password) {
      if (!remote) { lsSet("demo-user", { id: "demo", email }); return { confirm: false }; }
      const { data, error } = await sb.auth.signUp({ email, password });
      fail(error, "No se pudo crear la cuenta.");
      return { confirm: !data.session };
    },
    async signOut() {
      if (!remote) { try { localStorage.removeItem(P + "demo-user"); } catch {} return; }
      await sb.auth.signOut();
    },
    async accounts() {
      if (!remote) return [{ id: "demo", email: (lsGet("demo-user", {}) || {}).email || "demo@academia.mx", role: "super_admin" }];
      const { data, error } = await sb.rpc("admin_list_accounts");
      fail(error, "No se pudieron cargar las cuentas.");
      return data || [];
    },
    async setRole(target, role) {
      if (!remote) return;
      const { error } = await sb.rpc("admin_set_role", { target, new_role: role });
      fail(error, "No se pudo cambiar el permiso.");
    }
  };

  async function seedExamples() {
    for (const [table, rows] of Object.entries(SEED)) {
      if ((await list(table)).length) continue;
      for (const r of rows) await save(table, r);
    }
  }

  window.AcademiaData = { remote, list, save, remove, getSetting, setSetting, submitEnrollment, uploadImage, auth, seedExamples };
})();
