// Panel de administración · Academia Elite
(() => {
  const D = window.AcademiaData;
  const app = document.getElementById("app");

  // ───────── utilidades ─────────
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else if (k === "checked" || k === "disabled" || k === "hidden") e[k] = !!v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  const slugify = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  let toastT;
  function toast(msg, err) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.className = "show" + (err ? " err" : "");
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = ""), 4200);
  }
  const fail = e => toast(e && e.message ? e.message : "Ocurrió un error.", true);
  const cleanHtml = html => DOMPurify.sanitize(html || "", { ALLOWED_TAGS: ["p","br","h2","h3","h4","strong","em","u","s","ul","ol","li","blockquote","a","hr","img"], ALLOWED_ATTR: ["href","src","alt","target","rel"], ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/)/i });
  const isUrl = u => !u || /^https?:\/\/\S+$/i.test(u);
  const fmtDate = d => new Date(d).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

  const ROLE_LABEL = { super_admin: "Superadministrador", admin: "Administrador", editor: "Editor", viewer: "Consulta", pending: "Pendiente de aprobación" };
  const S = { role: "none", tab: "resumen", user: null };
  const canEdit = () => ["super_admin", "admin", "editor"].includes(S.role);
  const canAdmin = () => ["super_admin", "admin"].includes(S.role);
  const isSuper = () => S.role === "super_admin";

  // ───────── campos ─────────
  const f = (label, input, help) => h("label", { class: "f" }, label, input, help ? h("span", { class: "help" }, help) : null);
  const check = (label, checked, onchange) => h("label", { class: "f f--check" }, h("input", { type: "checkbox", checked, onchange }), label);

  function imagePicker({ folder, value, onChange, label = "Fotografía", disabled }) {
    const wrap = h("div", { class: "imgpick" });
    const input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "hidden" });
    function draw() {
      wrap.replaceChildren(
        value ? h("img", { src: value, alt: "Vista previa" }) : h("div", { class: "ph0" }, "Sin imagen"),
        h("div", { class: "bar", style: "margin:0" },
          disabled ? null : h("button", { type: "button", class: "btn btn--sm", onclick: () => input.click() }, value ? "Cambiar" : "Subir " + label.toLowerCase()),
          value && !disabled ? h("button", { type: "button", class: "btn btn--sm btn--danger", onclick: () => { value = ""; onChange(""); draw(); } }, "Quitar") : null),
        input);
    }
    input.addEventListener("change", async () => {
      const file = input.files[0]; if (!file) return;
      try { toast("Subiendo imagen…"); value = await D.uploadImage(file, folder); onChange(value); draw(); toast("Imagen lista."); }
      catch (e) { fail(e); } finally { input.value = ""; }
    });
    draw();
    return wrap;
  }

  // ───────── editor de texto enriquecido ─────────
  function richEditor(initial, disabled) {
    const area = h("div", { class: "rte__area", contenteditable: disabled ? "false" : "true", role: "textbox", "aria-label": "Contenido", "aria-multiline": "true" });
    area.innerHTML = cleanHtml(initial);
    const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "hidden" });
    const cmd = (c, v) => { area.focus(); document.execCommand(c, false, v); };
    const btn = (label, title, fn) => h("button", { type: "button", title, "aria-label": title, onclick: fn }, label);
    const bar = h("div", { class: "rte__bar" },
      btn("H2", "Título", () => cmd("formatBlock", "h2")), btn("H3", "Subtítulo", () => cmd("formatBlock", "h3")), btn("¶", "Párrafo", () => cmd("formatBlock", "p")),
      btn("B", "Negrita", () => cmd("bold")), btn("I", "Cursiva", () => cmd("italic")), btn("U", "Subrayado", () => cmd("underline")),
      btn("• Lista", "Lista", () => cmd("insertUnorderedList")), btn("1. Lista", "Lista numerada", () => cmd("insertOrderedList")),
      btn("“ ”", "Cita", () => cmd("formatBlock", "blockquote")),
      btn("🔗", "Enlace", () => { const u = prompt("Dirección del enlace (https://…)"); if (!u) return; if (!/^(https?:\/\/|mailto:)/i.test(u)) return toast("El enlace debe iniciar con https://", true); cmd("createLink", u); }),
      btn("⛓‍💥", "Quitar enlace", () => cmd("unlink")),
      btn("🖼", "Insertar imagen", () => file.click()),
      btn("↶", "Deshacer", () => cmd("undo")), btn("↷", "Rehacer", () => cmd("redo")));
    file.addEventListener("change", async () => {
      const fl = file.files[0]; if (!fl) return;
      try { toast("Subiendo imagen…"); const url = await D.uploadImage(fl, "paginas"); cmd("insertImage", url); toast("Imagen insertada."); } catch (e) { fail(e); } finally { file.value = ""; }
    });
    area.addEventListener("paste", e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, t); });
    const el = h("div", { class: "rte" }, disabled ? null : bar, area, file);
    return { el, html: () => cleanHtml(area.innerHTML) };
  }

  // ───────── gestor genérico de colecciones ─────────
  // cfg: { table, fields[], newRow(), title(r), sub(r), thumb(r), label }
  function collection(cfg) {
    const root = h("div");
    let rows = [], editing = null;

    async function load() { try { rows = await D.list(cfg.table); } catch (e) { fail(e); } draw(); }

    async function move(i, d) {
      const j = i + d; if (j < 0 || j >= rows.length) return;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      try { await Promise.all(rows.map((r, k) => r.display_order === k ? null : D.save(cfg.table, { ...r, display_order: k }))); toast("Orden actualizado."); } catch (e) { fail(e); }
      load();
    }
    async function del(r) {
      if (!confirm(`¿Eliminar "${cfg.title(r)}"? Esta acción no se puede deshacer.`)) return;
      try { await D.remove(cfg.table, r.id); toast("Eliminado."); } catch (e) { fail(e); }
      load();
    }
    async function toggle(r) { try { await D.save(cfg.table, { ...r, active: !r.active }); } catch (e) { fail(e); } load(); }

    function form(row) {
      const data = { ...row };
      const inputs = cfg.fields.map(fd => {
        if (fd.t === "bool") return check(fd.l, !!data[fd.k], e => (data[fd.k] = e.target.checked));
        if (fd.t === "image") return f(fd.l, imagePicker({ folder: cfg.table, value: data[fd.k] || "", label: fd.l, onChange: v => (data[fd.k] = v) }));
        if (fd.t === "textarea") return f(fd.l, h("textarea", { value: data[fd.k] || "", maxlength: fd.max || 1500, oninput: e => (data[fd.k] = e.target.value) }), fd.h);
        return f(fd.l, h("input", { type: fd.t === "number" ? "number" : "text", value: data[fd.k] ?? "", maxlength: fd.max || 160, oninput: e => (data[fd.k] = e.target.value) }), fd.h);
      });
      const err = h("p", { class: "help", style: "color:var(--red)" });
      const save = h("button", { class: "btn btn--gold", type: "submit" }, "Guardar");
      return h("form", { class: "panel", novalidate: true, onsubmit: async e => {
        e.preventDefault();
        for (const fd of cfg.fields) if (fd.req && !String(data[fd.k] ?? "").trim()) { err.textContent = `Falta: ${fd.l}.`; return; }
        save.disabled = true;
        try { await D.save(cfg.table, data); editing = null; toast("Guardado."); load(); } catch (x) { err.textContent = x.message; save.disabled = false; }
      } },
        h("h3", {}, data.id ? "Editar" : "Nuevo"),
        h("div", { class: "grid g2" }, inputs.filter((_, i) => cfg.fields[i].t !== "textarea" && cfg.fields[i].t !== "bool" && cfg.fields[i].t !== "image")),
        inputs.filter((_, i) => ["textarea", "image"].includes(cfg.fields[i].t)),
        h("div", { class: "grid g2" }, inputs.filter((_, i) => cfg.fields[i].t === "bool")),
        err,
        h("div", { class: "bar", style: "margin:0" }, save, h("button", { class: "btn", type: "button", onclick: () => { editing = null; draw(); } }, "Cancelar")));
    }

    function draw() {
      root.replaceChildren();
      if (editing) { root.append(form(editing)); return; }
      if (canEdit()) root.append(h("div", { class: "bar" }, h("button", { class: "btn btn--gold", onclick: () => { editing = cfg.newRow(rows.length); draw(); } }, "+ " + cfg.label)));
      if (!rows.length) { root.append(h("div", { class: "list" }, h("p", { class: "empty" }, "Todavía no hay registros. " + (canEdit() ? "Usa el botón para agregar el primero." : "")))); return; }
      root.append(h("div", { class: "list" }, rows.map((r, i) => {
        const th = cfg.thumb ? cfg.thumb(r) : "";
        return h("div", { class: "row" },
          cfg.thumb ? (th && /^(https?:|data:image)/.test(th) ? h("img", { class: "thumb", src: th, alt: "", loading: "lazy" }) : h("div", { class: "thumb" }, th || "—")) : h("div", { class: "thumb" }, String(i + 1)),
          h("div", { style: "min-width:0" }, h("div", { class: "row__t" }, cfg.title(r), r.active === false ? h("span", { class: "tag" }, "oculto") : null, r.featured ? h("span", { class: "tag tag--gold" }, "destacada") : null), h("div", { class: "row__s" }, cfg.sub(r))),
          canEdit() ? h("div", { class: "row__a" },
            h("button", { class: "btn btn--sm btn--icon", title: "Subir", disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
            h("button", { class: "btn btn--sm btn--icon", title: "Bajar", disabled: i === rows.length - 1, onclick: () => move(i, 1) }, "↓"),
            h("button", { class: "btn btn--sm", onclick: () => toggle(r) }, r.active === false ? "Mostrar" : "Ocultar"),
            h("button", { class: "btn btn--sm", onclick: () => { editing = r; draw(); } }, "Editar"),
            canAdmin() ? h("button", { class: "btn btn--sm btn--danger", onclick: () => del(r) }, "Eliminar") : null) : h("span"));
      })));
    }
    load();
    return root;
  }

  // ───────── secciones ─────────
  const sections = {};

  sections.resumen = () => {
    const root = h("div");
    (async () => {
      const [cat, coa, pho, pag, enr] = await Promise.all(["categories", "coaches", "albums", "pages", "enrollments"].map(t => D.list(t).catch(() => [])));
      root.append(h("div", { class: "stats" },
        [[enr.filter(e => e.status === "new").length, "Solicitudes nuevas"], [cat.length, "Categorías"], [coa.length, "Entrenadores"], [pho.length, "Galerías"], [pag.length, "Páginas"]]
          .map(([n, l]) => h("div", { class: "stat" }, h("b", {}, String(n)), h("span", {}, l)))));
      if (canEdit() && !cat.length) root.append(h("div", { class: "panel", style: "margin-top:20px" }, h("h3", {}, "Empieza rápido"), h("p", { class: "help" }, "Carga las categorías, horarios y preguntas de ejemplo para editarlos en lugar de escribir todo desde cero."),
        h("div", { class: "bar", style: "margin:0" }, h("button", { class: "btn btn--gold", onclick: async e => { e.target.disabled = true; try { await D.seedExamples(); toast("Contenido de ejemplo cargado."); go("resumen"); } catch (x) { fail(x); } } }, "Cargar contenido de ejemplo"))));
      root.append(h("div", { class: "panel", style: "margin-top:20px" }, h("h3", {}, "Cómo usar el panel"), h("ul", { class: "help", style: "padding-left:18px;display:grid;gap:6px" },
        h("li", {}, "Los cambios se ven de inmediato en el sitio público."),
        h("li", {}, "“Ocultar” retira un elemento del sitio sin borrarlo."),
        h("li", {}, "En “Páginas” puedes crear secciones nuevas, publicarlas y mostrarlas en el menú o el pie."),
        h("li", {}, "Las fotografías se optimizan automáticamente al subirlas."))));
    })();
    return root;
  };

  const NL = String.fromCharCode(10);
  const GENERAL_DEFAULTS = {
    hero_eyebrow: "Cantera oficial · Voleibol",
    hero_lead: "Aquí se forman las próximas Coronelas. Técnica, carácter y disciplina con el método del equipo profesional de Durango.",
    program_text: "La Academia Elite es el semillero de Coronelas de Durango: un camino claro para que cada jugadora aprenda, compita y crezca con la camiseta de su ciudad.",
    program_checks: ["Entrenadores certificados con experiencia en liga profesional", "Grupos por nivel y edad, con seguimiento individual", "Preparación física, técnica, táctica y mental", "Oportunidad de participar en torneos y exhibiciones con el club"],
    stats: [{ value: "6", label: "Categorías" }, { value: "3", label: "Sesiones por semana" }, { value: "", label: "" }],
    sched_text: "Confirma disponibilidad por categoría al solicitar tu clase de prueba.",
    form_text: "Déjanos tus datos y te contactamos para agendar tu clase de prueba gratuita. Enviar este formulario no es una inscripción; las condiciones de inscripción y costos se te explican al contactarte."
  };

  sections.general = () => {
    const root = h("div"); const d = {};
    D.getSetting("general", {}).then(g => {
      Object.assign(d, g);
      for (const [k, v] of Object.entries(GENERAL_DEFAULTS)) if (d[k] == null || (Array.isArray(d[k]) && !d[k].length)) d[k] = JSON.parse(JSON.stringify(v));
      while (d.stats.length < 3) d.stats.push({ value: "", label: "" });
      const ed = canEdit();
      const inp = (k, label, extra = {}, help) => f(label, h("input", { type: extra.type || "text", value: d[k] || "", disabled: !ed, maxlength: extra.max || 160, placeholder: extra.ph || "", oninput: e => (d[k] = e.target.value) }), help);
      const area = (k, label, help, max = 600) => f(label, h("textarea", { value: d[k] || "", disabled: !ed, maxlength: max, oninput: e => (d[k] = e.target.value) }), help);
      const checks = f("Puntos del programa", h("textarea", { value: d.program_checks.join(NL), disabled: !ed, maxlength: 800, style: "min-height:130px", oninput: e => (d.program_checks = e.target.value.split(NL).map(x => x.trim()).filter(Boolean).slice(0, 8)) }), "Uno por línea. Escribe solo lo que la academia pueda cumplir.");
      root.append(h("form", { class: "panel", onsubmit: async e => {
        e.preventDefault();
        if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return toast("El correo no es válido.", true);
        try { await D.setSetting("general", { ...(await D.getSetting("general", {})), ...d }); toast("Información guardada."); } catch (x) { fail(x); }
      } },
        h("h3", {}, "Portada"),
        inp("hero_eyebrow", "Etiqueta sobre el título", {}, "Ej. “Cantera oficial · Voleibol”. Escribe solo lo que sea cierto."),
        area("hero_lead", "Frase principal", "Aparece bajo el título “Academia Elite”."),
        h("p", { class: "help" }, "Cifras de la portada. Deja valor y texto vacíos para ocultar una cifra."),
        h("div", { class: "grid g3" }, d.stats.slice(0, 3).map((st, i) => h("div", { style: "display:grid;gap:8px" },
          f("Cifra " + (i + 1), h("input", { type: "text", value: st.value, maxlength: 8, disabled: !ed, oninput: e => (st.value = e.target.value.trim()) })),
          f("Texto", h("input", { type: "text", value: st.label, maxlength: 40, disabled: !ed, oninput: e => (st.label = e.target.value.trim()) }))))),
        h("h3", {}, "Programa"),
        area("program_text", "Descripción del programa"),
        checks,
        h("h3", {}, "Horarios y clase de prueba"),
        area("sched_text", "Texto junto a los horarios"),
        area("form_text", "Texto sobre el formulario de clase de prueba", "Aquí puedes indicar, por ejemplo, que la clase de prueba es gratuita.", 400),
        h("h3", {}, "Contacto y sede"),
        h("div", { class: "grid g2" },
          inp("whatsapp", "WhatsApp de solicitudes", { ph: "526180000000" }, "Con lada de país, sin + ni espacios. Si lo llenas, la solicitud abre WhatsApp."),
          inp("phone", "Teléfono"), inp("email", "Correo", { type: "email" }), inp("venue", "Nombre de la sede")),
        inp("address", "Dirección", { max: 240 }),
        ed ? h("div", { class: "bar", style: "margin:0" }, h("button", { class: "btn btn--gold" }, "Guardar información")) : null));
    });
    return root;
  };

  sections.redes = () => {
    const root = h("div"); const d = {};
    D.getSetting("general", {}).then(g => {
      d.social = { ...(g.social || {}) };
      const ed = canEdit();
      root.append(h("form", { class: "panel", onsubmit: async e => {
        e.preventDefault();
        for (const v of Object.values(d.social)) if (!isUrl(v)) return toast("Cada enlace debe iniciar con https://", true);
        try { await D.setSetting("general", { ...(await D.getSetting("general", {})), social: d.social }); toast("Redes sociales actualizadas."); } catch (x) { fail(x); }
      } },
        h("p", { class: "help" }, "Solo se muestran en el pie del sitio las redes con enlace completo."),
        h("div", { class: "grid g2" }, [["facebook", "Facebook"], ["instagram", "Instagram"], ["x", "X (Twitter)"], ["youtube", "YouTube"], ["tiktok", "TikTok"]].map(([k, l]) =>
          f(l, h("input", { type: "url", value: d.social[k] || "", disabled: !ed, placeholder: "https://", oninput: e => (d.social[k] = e.target.value.trim()) })))),
        ed ? h("div", { class: "bar", style: "margin:0" }, h("button", { class: "btn btn--gold" }, "Guardar redes")) : null));
    });
    return root;
  };

  sections.imagenes = () => {
    const root = h("div"); let home = { slides: [], interval: 6 };
    const ed = canEdit();
    const input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, class: "hidden" });
    async function persist(msg) { try { await D.setSetting("home", home); if (msg) toast(msg); } catch (e) { fail(e); } draw(); }
    function draw() {
      root.replaceChildren(h("div", { class: "panel" },
        h("h3", {}, "Presentación de la portada"),
        h("p", { class: "help" }, "Fotografías horizontales que rotan al fondo de la portada. Con una sola imagen no rota; sin imágenes se usa el fondo de color."),
        ed ? h("div", { class: "bar", style: "margin:0" }, h("button", { class: "btn btn--gold", onclick: () => input.click() }, "+ Subir imágenes"), input) : null,
        home.slides.length ? h("div", { class: "photos" }, home.slides.map((s, i) => h("div", { class: "ph" }, h("img", { src: s.url, alt: "" }),
          ed ? h("div", { class: "ph__b" }, h("div", { class: "ph__a" },
            h("button", { class: "btn btn--sm btn--icon", disabled: i === 0, onclick: () => { [home.slides[i - 1], home.slides[i]] = [home.slides[i], home.slides[i - 1]]; persist("Orden actualizado."); } }, "←"),
            h("button", { class: "btn btn--sm btn--icon", disabled: i === home.slides.length - 1, onclick: () => { [home.slides[i + 1], home.slides[i]] = [home.slides[i], home.slides[i + 1]]; persist("Orden actualizado."); } }, "→"),
            h("button", { class: "btn btn--sm btn--danger", onclick: () => { home.slides.splice(i, 1); persist("Imagen quitada."); } }, "Quitar")) ) : null)))
          : h("p", { class: "empty" }, "Sin imágenes en la presentación."),
        f("Segundos entre imágenes", h("input", { type: "number", min: 3, max: 30, value: home.interval, disabled: !ed, onchange: e => { home.interval = Math.min(30, Math.max(3, +e.target.value || 6)); persist("Intervalo guardado."); } }))));
    }
    input.addEventListener("change", async () => {
      try { toast("Subiendo imágenes…"); for (const file of input.files) home.slides.push({ url: await D.uploadImage(file, "portada") }); await persist("Imágenes agregadas."); } catch (e) { fail(e); } finally { input.value = ""; }
    });
    D.getSetting("home", { slides: [], interval: 6 }).then(v => { home = v; if (!Array.isArray(home.slides)) home.slides = []; draw(); });
    return root;
  };

  sections.categorias = () => collection({
    table: "categories", label: "Nueva categoría", newRow: n => ({ name: "", age: "", description: "", featured: false, display_order: n, active: true }),
    fields: [{ k: "name", l: "Nombre", t: "text", req: 1, max: 80 }, { k: "age", l: "Edades", t: "text", max: 60 }, { k: "description", l: "Descripción", t: "textarea", max: 400 }, { k: "featured", l: "Destacar (tarjeta dorada)", t: "bool" }, { k: "active", l: "Visible en el sitio", t: "bool" }],
    title: r => r.name, sub: r => `${r.age || "—"} · ${r.description || ""}`
  });

  sections.horarios = () => collection({
    table: "schedules", label: "Nuevo horario", newRow: n => ({ label: "", days: "", time: "", display_order: n, active: true }),
    fields: [{ k: "label", l: "Categoría / grupo", t: "text", req: 1, max: 80 }, { k: "days", l: "Días", t: "text", h: "Ej. Lun · Mié · Vie" }, { k: "time", l: "Horario", t: "text", h: "Ej. 4:00 – 5:30 pm" }, { k: "active", l: "Visible en el sitio", t: "bool" }],
    title: r => r.label, sub: r => `${r.days} · ${r.time}`
  });

  sections.entrenadores = () => collection({
    table: "coaches", label: "Nuevo entrenador", newRow: n => ({ name: "", role: "", bio: "", photo_url: "", display_order: n, active: true }),
    fields: [{ k: "name", l: "Nombre", t: "text", req: 1, max: 120 }, { k: "role", l: "Cargo", t: "text", h: "Ej. Entrenadora principal", max: 80 }, { k: "bio", l: "Semblanza", t: "textarea", max: 1500 }, { k: "photo_url", l: "Fotografía", t: "image" }, { k: "active", l: "Visible en el sitio", t: "bool" }],
    title: r => r.name, sub: r => r.role || "Sin cargo", thumb: r => r.photo_url || (r.name || "?").charAt(0)
  });

  sections.faq = () => collection({
    table: "faqs", label: "Nueva pregunta", newRow: n => ({ question: "", answer: "", display_order: n, active: true }),
    fields: [{ k: "question", l: "Pregunta", t: "text", req: 1, max: 200 }, { k: "answer", l: "Respuesta", t: "textarea", max: 2000 }, { k: "active", l: "Visible en el sitio", t: "bool" }],
    title: r => r.question, sub: r => r.answer
  });

  // ───────── Galerías: álbumes de fotos y videos (entrenamientos por grupo, torneos, eventos) ─────────
  const KINDS = { entrenamiento: "Entrenamiento", torneo: "Torneo", evento: "Evento", otro: "Otro" };
  const fmtDay = d => (d ? new Date(d + "T12:00:00").toLocaleDateString("es-MX", { dateStyle: "long" }) : "");

  sections.galeria = () => {
    const root = h("div"); const ed = canEdit();
    let albums = [], counts = {}, current = null, media = [], editing = null;

    async function loadList() {
      try {
        const [a, m] = await Promise.all([D.list("albums", { orderBy: "created_at", asc: false }), D.list("media")]);
        albums = a.sort((x, y) => String(y.event_date || y.created_at).localeCompare(String(x.event_date || x.created_at)));
        counts = {}; m.forEach(x => (counts[x.album_id] = (counts[x.album_id] || 0) + 1));
        for (const al of albums) al._cover = al.cover_url || (m.find(x => x.album_id === al.id && x.kind === "photo") || {}).url || "";
      } catch (e) { fail(e); }
      drawList();
    }
    async function loadAlbum() { try { media = await D.list("media", { where: { album_id: current.id } }); } catch (e) { fail(e); } drawAlbum(); }

    // ── Lista de álbumes ──
    function drawList() {
      if (editing) return root.replaceChildren(albumForm(editing));
      root.replaceChildren(...[
        ed ? h("div", { class: "bar" }, h("button", { class: "btn btn--gold", onclick: () => { editing = { title: "", kind: "entrenamiento", group_name: "", event_date: "", description: "", active: true }; drawList(); } }, "+ Nueva galería"),
          h("span", { class: "help" }, "Crea una galería por grupo, entrenamiento o torneo y súbele fotos y videos.")) : null,
        albums.length ? h("div", { class: "list" }, albums.map(a => h("div", { class: "row" },
          a._cover ? h("img", { class: "thumb", src: a._cover, alt: "", loading: "lazy" }) : h("div", { class: "thumb" }, "—"),
          h("div", { style: "min-width:0" },
            h("div", { class: "row__t" }, a.title, h("span", { class: "tag tag--gold" }, KINDS[a.kind] || a.kind), a.active === false ? h("span", { class: "tag" }, "oculta") : null),
            h("div", { class: "row__s" }, [a.group_name, fmtDay(a.event_date), `${counts[a.id] || 0} archivo${counts[a.id] === 1 ? "" : "s"}`].filter(Boolean).join(" · "))),
          h("div", { class: "row__a" },
            h("button", { class: "btn btn--sm", onclick: () => { current = a; media = []; drawAlbum(); loadAlbum(); } }, ed ? "Administrar" : "Ver"),
            canAdmin() ? h("button", { class: "btn btn--sm btn--danger", onclick: async () => { if (!confirm(`¿Eliminar la galería "${a.title}" y todas sus fotos y videos? No se puede deshacer.`)) return; try { await D.remove("albums", a.id); toast("Galería eliminada."); } catch (e) { fail(e); } loadList(); } }, "Eliminar") : null))))
          : h("div", { class: "list" }, h("p", { class: "empty" }, "Aún no hay galerías. Crea la primera; aparecerá la sección “Galería” en el sitio cuando tenga fotos o videos."))].filter(Boolean));
    }

    // ── Datos del álbum ──
    function albumForm(row) {
      const d = { ...row };
      const err = h("p", { class: "help", style: "color:var(--red)" });
      const save = h("button", { class: "btn btn--gold", type: "submit" }, "Guardar");
      return h("form", { class: "panel", novalidate: true, onsubmit: async e => {
        e.preventDefault();
        if (!String(d.title || "").trim()) { err.textContent = "Falta el título."; return; }
        save.disabled = true;
        try {
          const out = { ...d, title: d.title.trim(), event_date: d.event_date || null, group_name: (d.group_name || "").trim(), description: (d.description || "").trim() };
          delete out._cover;
          const saved = await D.save("albums", out); toast("Galería guardada.");
          editing = null;
          if (!d.id) { current = saved; media = []; drawAlbum(); loadAlbum(); }
          else if (current) { current = { ...current, ...saved }; drawAlbum(); }
          else loadList();
        } catch (x) { err.textContent = x.message; save.disabled = false; }
      } },
        h("h3", {}, d.id ? "Datos de la galería" : "Nueva galería"),
        h("div", { class: "grid g2" },
          f("Título", h("input", { value: d.title || "", maxlength: 120, placeholder: "Ej. Torneo Estatal Sub-18", oninput: e => (d.title = e.target.value) })),
          f("Tipo", h("select", { onchange: e => (d.kind = e.target.value) }, Object.entries(KINDS).map(([v, l]) => h("option", { value: v, selected: d.kind === v }, l)))),
          f("Grupo o categoría", h("input", { value: d.group_name || "", maxlength: 80, placeholder: "Ej. Cadete, Juvenil (opcional)", oninput: e => (d.group_name = e.target.value) })),
          f("Fecha", h("input", { type: "date", value: d.event_date || "", oninput: e => (d.event_date = e.target.value) }))),
        f("Descripción", h("textarea", { value: d.description || "", maxlength: 600, oninput: e => (d.description = e.target.value) }), "Opcional. Se muestra al abrir la galería."),
        check("Visible en el sitio", d.active !== false, e => (d.active = e.target.checked)),
        err, h("div", { class: "bar", style: "margin:0" }, save, h("button", { class: "btn", type: "button", onclick: () => { editing = null; current ? drawAlbum() : drawList(); } }, "Cancelar")));
    }

    // ── Contenido del álbum ──
    const photoIn = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, class: "hidden" });
    const videoIn = h("input", { type: "file", accept: "video/mp4,video/webm", class: "hidden" });
    const linkIn = h("input", { class: "inp", type: "url", placeholder: "Enlace de YouTube o Vimeo", maxlength: 300, style: "min-width:220px;flex:1" });
    async function addMedia(rows) { let n = media.length; for (const r of rows) await D.save("media", { album_id: current.id, caption: "", display_order: n++, active: true, ...r }); }
    async function busy(msg, fn, ok) { try { toast(msg); await fn(); toast(ok); } catch (e) { fail(e); } finally { photoIn.value = ""; videoIn.value = ""; loadAlbum(); } }
    photoIn.addEventListener("change", () => busy("Subiendo fotografías…", async () => { const rows = []; for (const fl of photoIn.files) rows.push({ kind: "photo", url: await D.uploadImage(fl, "galerias") }); await addMedia(rows); }, "Fotografías agregadas."));
    videoIn.addEventListener("change", () => busy("Subiendo video… puede tardar", async () => { const fl = videoIn.files[0]; if (fl) await addMedia([{ kind: "video", url: await D.uploadVideo(fl, "videos") }]); }, "Video agregado."));
    function addLink() {
      const url = linkIn.value.trim();
      if (!D.embedInfo(url)) return toast("Solo se aceptan enlaces de YouTube o Vimeo (https://…).", true);
      busy("Agregando video…", async () => { await addMedia([{ kind: "embed", url }]); linkIn.value = ""; }, "Video agregado.");
    }
    async function upd(r, patch, msg) { try { await D.save("media", { ...r, ...patch }); if (msg) toast(msg); } catch (e) { fail(e); } loadAlbum(); }
    async function swap(i, j) { const a = media[i], b = media[j]; try { await D.save("media", { ...a, display_order: j }); await D.save("media", { ...b, display_order: i }); } catch (e) { fail(e); } loadAlbum(); }

    function tile(r, i) {
      const info = r.kind === "embed" ? D.embedInfo(r.url) : null;
      const view = r.kind === "photo" ? h("img", { src: r.url, alt: r.caption || "", loading: "lazy" })
        : r.kind === "video" ? h("video", { src: r.url + "#t=0.1", preload: "metadata", muted: true, playsinline: true, controls: true })
        : info && info.thumb ? h("img", { src: info.thumb, alt: "", loading: "lazy" }) : h("div", { class: "ph0" }, "Video de Vimeo");
      return h("div", { class: "ph" + (r.active === false ? " off" : "") }, view,
        h("div", { class: "ph__b" },
          r.kind !== "photo" ? h("span", { class: "tag" }, r.kind === "video" ? "▶ video" : "▶ " + (info ? info.provider : "enlace")) : null,
          h("input", { class: "inp", value: r.caption || "", maxlength: 200, placeholder: "Pie (opcional)", disabled: !ed, onchange: e => upd(r, { caption: e.target.value.trim() }, "Pie guardado.") }),
          ed ? h("div", { class: "ph__a" },
            h("button", { class: "btn btn--sm btn--icon", disabled: i === 0, onclick: () => swap(i, i - 1) }, "←"),
            h("button", { class: "btn btn--sm btn--icon", disabled: i === media.length - 1, onclick: () => swap(i, i + 1) }, "→"),
            r.kind === "photo" ? h("button", { class: "btn btn--sm", disabled: current.cover_url === r.url, onclick: async () => { try { await D.save("albums", { ...current, cover_url: r.url }); current = { ...current, cover_url: r.url }; toast("Portada actualizada."); } catch (e) { fail(e); } drawAlbum(); } }, current.cover_url === r.url ? "Portada" : "Hacer portada") : null,
            h("button", { class: "btn btn--sm", onclick: () => upd(r, { active: r.active === false }) }, r.active === false ? "Mostrar" : "Ocultar"),
            canAdmin() ? h("button", { class: "btn btn--sm btn--danger", onclick: async () => { if (!confirm("¿Eliminar este archivo?")) return; try { await D.remove("media", r.id); toast("Eliminado."); } catch (e) { fail(e); } loadAlbum(); } }, "Eliminar") : null) : null));
    }

    function drawAlbum() {
      if (editing) return root.replaceChildren(albumForm(editing));
      const a = current;
      root.replaceChildren(...[
        h("div", { class: "bar" },
          h("button", { class: "btn", onclick: () => { current = null; loadList(); } }, "← Todas las galerías"),
          ed ? h("button", { class: "btn", onclick: () => { editing = { ...a }; drawAlbum(); } }, "Editar datos") : null),
        h("div", { class: "panel", style: "border-top-width:1px" },
          h("h3", {}, a.title, " ", h("span", { class: "tag tag--gold" }, KINDS[a.kind] || a.kind), a.active === false ? h("span", { class: "tag" }, "oculta") : null),
          h("p", { class: "help" }, [a.group_name, fmtDay(a.event_date)].filter(Boolean).join(" · ") || "Sin grupo ni fecha"),
          a.description ? h("p", {}, a.description) : null),
        ed ? h("div", { class: "panel", style: "border-top-width:1px;gap:12px" },
          h("div", { class: "bar", style: "margin:0" },
            h("button", { class: "btn btn--gold", onclick: () => photoIn.click() }, "+ Subir fotografías"),
            h("button", { class: "btn", onclick: () => videoIn.click() }, "+ Subir video"),
            h("span", { class: "help" }, "Fotos: varias a la vez. Video: MP4 o WebM de hasta 50 MB."), photoIn, videoIn),
          h("div", { class: "bar", style: "margin:0;flex-wrap:nowrap" }, linkIn, h("button", { class: "btn", style: "white-space:nowrap", onclick: addLink }, "+ Agregar enlace")),
          h("span", { class: "help" }, "Para videos largos o pesados, súbelos a YouTube como “no listado” y pega aquí el enlace; se verán dentro de la galería.")) : null,
        media.length ? h("div", { class: "photos" }, media.map(tile))
          : h("div", { class: "list" }, h("p", { class: "empty" }, "Esta galería aún no tiene fotos ni videos."))].filter(Boolean));
    }

    loadList();
    return root;
  };

  sections.paginas = () => {
    const root = h("div"); let rows = [], editing = null;
    async function load() { try { rows = await D.list("pages"); } catch (e) { fail(e); } draw(); }
    function form(row) {
      const d = { ...row }; let slugTouched = !!d.id;
      const rte = richEditor(d.content, false);
      const slug = h("input", { type: "text", value: d.slug, maxlength: 80, oninput: e => { slugTouched = true; d.slug = e.target.value; } });
      const err = h("p", { class: "help", style: "color:var(--red)" });
      return h("form", { class: "panel", novalidate: true, onsubmit: async e => {
        e.preventDefault();
        d.slug = slugify(d.slug || d.title); d.content = rte.html(); d.display_order = Number(d.display_order) || 0;
        if (!d.title.trim()) return (err.textContent = "Falta el título.");
        if (!d.slug) return (err.textContent = "Falta la dirección de la página.");
        if (d.status === "published" && !d.content.replace(/<[^>]*>/g, "").trim() && !/<img/.test(d.content)) return (err.textContent = "Escribe contenido antes de publicar.");
        try { await D.save("pages", d); editing = null; toast(d.status === "published" ? "Página publicada." : "Borrador guardado."); load(); } catch (x) { err.textContent = x.message; }
      } },
        h("h3", {}, d.id ? "Editar página" : "Nueva página"),
        h("div", { class: "grid g2" },
          f("Título", h("input", { type: "text", value: d.title, maxlength: 160, oninput: e => { d.title = e.target.value; if (!slugTouched) { d.slug = slugify(d.title); slug.value = d.slug; } } })),
          f("Dirección (URL)", slug, "Se verá como pagina.html?slug=…")),
        f("Contenido", rte.el),
        f("Imagen de portada de la página", imagePicker({ folder: "paginas", value: d.hero_image_url || "", label: "imagen", onChange: v => (d.hero_image_url = v) })),
        h("div", { class: "grid g3" },
          f("Estado", h("select", { onchange: e => (d.status = e.target.value) }, h("option", { value: "draft", selected: d.status !== "published" }, "Borrador"), h("option", { value: "published", selected: d.status === "published" }, "Publicada"))),
          f("Orden", h("input", { type: "number", value: d.display_order, oninput: e => (d.display_order = e.target.value) })),
          h("div", { style: "display:grid;gap:8px;align-content:end" }, check("Mostrar en el menú", d.show_in_menu, e => (d.show_in_menu = e.target.checked)), check("Mostrar en el pie", d.show_in_footer, e => (d.show_in_footer = e.target.checked)))),
        err,
        h("div", { class: "bar", style: "margin:0" }, h("button", { class: "btn btn--gold" }, "Guardar"), h("button", { type: "button", class: "btn", onclick: () => { editing = null; draw(); } }, "Cancelar")));
    }
    function draw() {
      root.replaceChildren();
      if (editing) return root.append(form(editing));
      if (canEdit()) root.append(h("div", { class: "bar" }, h("button", { class: "btn btn--gold", onclick: () => { editing = { title: "", slug: "", content: "", hero_image_url: "", status: "draft", show_in_menu: false, show_in_footer: false, display_order: rows.length }; draw(); } }, "+ Nueva página")));
      if (!rows.length) return root.append(h("div", { class: "list" }, h("p", { class: "empty" }, "No hay páginas adicionales. Crea una (por ejemplo “Aviso de privacidad” o “Reglamento”).")));
      root.append(h("div", { class: "list" }, rows.map(r => h("div", { class: "row" },
        h("div", { class: "thumb" }, "§"),
        h("div", { style: "min-width:0" }, h("div", { class: "row__t" }, r.title, h("span", { class: "tag " + (r.status === "published" ? "tag--ok" : "") }, r.status === "published" ? "publicada" : "borrador"), r.show_in_menu ? h("span", { class: "tag" }, "menú") : null, r.show_in_footer ? h("span", { class: "tag" }, "pie") : null), h("div", { class: "row__s" }, "pagina.html?slug=" + r.slug)),
        h("div", { class: "row__a" },
          r.status === "published" ? h("a", { class: "btn btn--sm", href: "../pagina.html?slug=" + encodeURIComponent(r.slug), target: "_blank", rel: "noopener" }, "Ver") : null,
          canEdit() ? h("button", { class: "btn btn--sm", onclick: () => { editing = r; draw(); } }, "Editar") : null,
          canAdmin() ? h("button", { class: "btn btn--sm btn--danger", onclick: async () => { if (!confirm(`¿Eliminar la página "${r.title}"?`)) return; try { await D.remove("pages", r.id); toast("Página eliminada."); } catch (e) { fail(e); } load(); } }, "Eliminar") : null)))));
    }
    load();
    return root;
  };

  sections.solicitudes = () => {
    const root = h("div"); let rows = [], filter = "all"; const sel = new Set();
    const ST = { new: "Nueva", contacted: "Contactada", enrolled: "Inscrita", discarded: "Descartada" };
    async function load() { try { rows = await D.list("enrollments"); } catch (e) { fail(e); } for (const id of [...sel]) if (!rows.some(r => r.id === id)) sel.delete(id); draw(); }
    const shown = () => (filter === "all" ? rows : rows.filter(r => r.status === filter));
    // Sin selección se exportan todas las solicitudes existentes; con selección, solo las marcadas.
    const target = () => (sel.size ? rows.filter(r => sel.has(r.id)) : rows);
    const HEAD = ["Fecha", "Nombre(s) jugadora", "Apellido paterno", "Apellido materno", "Edad", "Categoría", "Nombre(s) tutor", "Apellido paterno tutor", "Apellido materno tutor", "Teléfono", "Estado"];
    const table = () => target().map(r => [fmtDate(r.created_at), r.player_first || r.player_name, r.player_paternal, r.player_maternal, r.age, r.category, r.guardian_first || r.guardian, r.guardian_paternal, r.guardian_maternal, r.phone, ST[r.status]].map(v => v ?? ""));
    const stamp = () => new Date().toISOString().slice(0, 10);
    function save(blob, name) { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); }
    function csv() {
      // Las celdas que empiezan con = + - @ se prefijan con ' para que Excel no las ejecute como fórmulas.
      const q = v => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
      const lines = [HEAD, ...table()].map(r => r.map(q).join(","));
      save(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `solicitudes-academia-${stamp()}.csv`);
    }
    function xlsx() {
      if (!window.XLSX) return toast("No se pudo cargar el exportador de Excel. Revisa tu conexión o usa CSV.", true);
      // Todo se guarda como texto para conservar teléfonos y evitar que se interpreten fórmulas.
      const data = [HEAD, ...table()].map(r => r.map(v => String(v)));
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!cols"] = HEAD.map((t, i) => ({ wch: Math.min(32, Math.max(t.length, ...data.slice(1).map(r => r[i].length)) + 2) }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
      XLSX.writeFile(wb, `solicitudes-academia-${stamp()}.xlsx`);
    }
    function draw() {
      const list = shown(), n = target().length;
      const allOn = list.length > 0 && list.every(r => sel.has(r.id));
      const what = sel.size ? `${n} seleccionada${n === 1 ? "" : "s"}` : `todas (${n})`;
      root.replaceChildren(...[rows.length && canAdmin() ? h("div", { class: "panel", style: "border-top-width:1px;gap:12px" },
        h("div", { class: "bar", style: "margin:0" },
          h("label", { class: "f f--check" }, h("input", { type: "checkbox", checked: allOn, onchange: e => { list.forEach(r => (e.target.checked ? sel.add(r.id) : sel.delete(r.id))); draw(); } }), "Seleccionar todas las que se ven"),
          h("select", { class: "inp", style: "width:auto", "aria-label": "Filtrar por estado", onchange: e => { filter = e.target.value; draw(); } },
            h("option", { value: "all", selected: filter === "all" }, "Todos los estados"), Object.entries(ST).map(([v, l]) => h("option", { value: v, selected: filter === v }, l))),
          sel.size ? h("button", { class: "btn btn--sm", onclick: () => { sel.clear(); draw(); } }, "Quitar selección") : null),
        h("div", { class: "bar", style: "margin:0" },
          h("button", { class: "btn btn--gold", onclick: xlsx }, "Exportar Excel (.xlsx)"), h("button", { class: "btn", onclick: csv }, "Exportar CSV"),
          h("span", { class: "help" }, `Se exportarán: ${what}. ${sel.size ? "" : "Marca casillas para elegir solo algunas."}`))) : null,
        rows.length ? h("div", { class: "list" }, list.length ? list.map(r => h("div", { class: "req" },
          h("div", { class: "req__h" },
            canAdmin() ? h("input", { type: "checkbox", checked: sel.has(r.id), "aria-label": "Seleccionar " + r.player_name, style: "width:18px;height:18px;accent-color:var(--gold);flex:none", onchange: e => { e.target.checked ? sel.add(r.id) : sel.delete(r.id); draw(); } }) : null,
            h("b", { class: "req__n" }, r.player_name), h("span", { class: "tag" }, ST[r.status] || r.status)),
          h("dl", { class: "req__d" },
            h("div", {}, h("dt", {}, "Edad"), h("dd", {}, r.age ? `${r.age} años` : "—")),
            h("div", {}, h("dt", {}, "Categoría"), h("dd", {}, r.category || "Sin categoría")),
            h("div", {}, h("dt", {}, "Tutor"), h("dd", {}, r.guardian || "—")),
            h("div", {}, h("dt", {}, "Teléfono"), h("dd", {}, h("a", { href: "tel:" + String(r.phone).replace(/[^\d+]/g, "") }, r.phone))),
            h("div", {}, h("dt", {}, "Recibida"), h("dd", {}, fmtDate(r.created_at)))),
          h("div", { class: "row__a", style: "justify-content:flex-start" },
            h("select", { class: "inp", style: "width:auto", disabled: !canEdit(), "aria-label": "Estado", onchange: async e => { try { await D.save("enrollments", { ...r, status: e.target.value }); toast("Estado actualizado."); } catch (x) { fail(x); } load(); } },
              Object.entries(ST).map(([v, l]) => h("option", { value: v, selected: r.status === v }, l))),
            canAdmin() ? h("button", { class: "btn btn--sm btn--danger", onclick: async () => { if (!confirm("¿Eliminar esta solicitud?")) return; try { await D.remove("enrollments", r.id); } catch (x) { fail(x); } load(); } }, "Eliminar") : null)))
          : h("p", { class: "empty" }, "Ninguna solicitud con ese estado."))
          : h("div", { class: "list" }, h("p", { class: "empty" }, "Aún no hay solicitudes de clase de prueba."))].filter(Boolean));
    }
    load();
    return root;
  };

  // Contraseña temporal legible (sin caracteres ambiguos) con al menos una letra y un número.
  function tempPassword() {
    const L = "abcdefghjkmnpqrstuvwxyz", U = "ABCDEFGHJKLMNPQRSTUVWXYZ", N = "23456789", all = L + U + N;
    const pick = set => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
    const chars = [pick(U), pick(L), pick(N), pick(N)];
    while (chars.length < 10) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join("");
  }

  sections.cuentas = () => {
    const root = h("div");
    if (!isSuper()) return h("div", { class: "notice" }, "Solo el superadministrador puede ver este módulo.");
    const ROLES = [["admin", "Administrador"], ["editor", "Editor"], ["viewer", "Consulta"]];
    const siteUrl = () => location.origin + location.pathname;
    let card = null; // tarjeta de acceso recién generada (se muestra una sola vez)

    function accessCard(email, password, title) {
      const text = `Acceso al panel de Academia Elite\nDirección: ${siteUrl()}\nUsuario: ${email}\nContraseña temporal: ${password}\n\nAl entrar por primera vez se te pedirá crear tu propia contraseña.`;
      return h("div", { class: "panel", style: "border-top-color:var(--ok)" },
        h("h3", {}, title),
        h("p", { class: "help" }, "Esta contraseña se muestra solo ahora. Cópiala y entrégala por un medio privado; la persona deberá cambiarla al entrar."),
        h("pre", { style: "background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:14px;white-space:pre-wrap;user-select:all;font:inherit" }, text),
        h("div", { class: "bar", style: "margin:0" },
          h("button", { class: "btn btn--gold", onclick: async () => { try { await navigator.clipboard.writeText(text); toast("Acceso copiado."); } catch { toast("No se pudo copiar; selecciona el texto manualmente.", true); } } }, "Copiar acceso"),
          h("button", { class: "btn", onclick: () => { card = null; draw(); } }, "Cerrar")));
    }

    function createForm() {
      const email = h("input", { type: "email", maxlength: 160, placeholder: "persona@correo.com", autocomplete: "off" });
      const pass = h("input", { type: "text", maxlength: 72, value: tempPassword(), autocomplete: "off", spellcheck: "false" });
      const role = h("select", {}, ROLES.map(([v, l], i) => h("option", { value: v, selected: i === 1 }, l)));
      const err = h("p", { class: "help", style: "color:var(--red)" });
      const submit = h("button", { class: "btn btn--gold" }, "Crear usuario");
      return h("form", { class: "panel", novalidate: true, onsubmit: async e => {
        e.preventDefault(); err.textContent = "";
        const em = email.value.trim().toLowerCase(), pw = pass.value;
        if (!/^\S+@\S+\.\S+$/.test(em)) return (err.textContent = "Escribe un correo válido.");
        if (pw.length < 8) return (err.textContent = "La contraseña temporal debe tener al menos 8 caracteres.");
        submit.disabled = true;
        try { await D.auth.manage({ action: "create", email: em, password: pw, role: role.value }); card = accessCard(em, pw, "Usuario creado"); toast("Usuario creado."); await load(); }
        catch (x) { err.textContent = x.message; submit.disabled = false; }
      } },
        h("h3", {}, "Crear usuario"),
        h("p", { class: "help" }, "Crea la cuenta con una contraseña temporal. En su primer ingreso, la persona deberá elegir su propia contraseña."),
        h("div", { class: "grid g2" }, f("Correo (será su usuario)", email), f("Permiso", role)),
        f("Contraseña temporal", h("div", { class: "bar", style: "margin:0;flex-wrap:nowrap" }, pass, h("button", { type: "button", class: "btn", style: "white-space:nowrap", onclick: () => (pass.value = tempPassword()) }, "Generar otra")), "Mínimo 8 caracteres. Se genera una segura por defecto."),
        err, h("div", { class: "bar", style: "margin:0" }, submit));
    }

    let list = [];
    async function load() { try { list = await D.auth.accounts(); } catch (e) { fail(e); } draw(); }

    function draw() {
      root.replaceChildren(...[
        card, createForm(),
        h("div", { class: "list" }, list.length ? list.map(a => {
          const me = S.user && a.id === S.user.id, prot = a.role === "super_admin";
          return h("div", { class: "row" },
            h("div", { class: "thumb" }, (a.email || "?").charAt(0).toUpperCase()),
            h("div", { style: "min-width:0" }, h("div", { class: "row__t" }, a.email, a.must_change ? h("span", { class: "tag tag--gold" }, "debe cambiar contraseña") : null, me ? h("span", { class: "tag" }, "tú") : null)),
            prot ? h("span", { class: "tag tag--gold" }, "Superadministrador") : h("div", { class: "row__a" },
              h("select", { class: "inp", style: "width:auto", "aria-label": "Permiso de " + a.email, onchange: async e => { try { await D.auth.setRole(a.id, e.target.value); toast("Permiso actualizado."); } catch (x) { fail(x); } load(); } },
                [["pending", "Pendiente"], ...ROLES].map(([v, l]) => h("option", { value: v, selected: a.role === v }, l))),
              h("button", { class: "btn btn--sm", onclick: async () => {
                if (!confirm(`¿Restablecer la contraseña de ${a.email}? Se generará una temporal y deberá cambiarla al entrar.`)) return;
                const pw = tempPassword();
                try { await D.auth.manage({ action: "reset", userId: a.id, password: pw }); card = accessCard(a.email, pw, "Contraseña restablecida"); toast("Contraseña restablecida."); } catch (x) { fail(x); }
                load();
              } }, "Restablecer contraseña"),
              h("button", { class: "btn btn--sm btn--danger", onclick: async () => {
                if (!confirm(`¿Eliminar la cuenta ${a.email}? Esta acción no se puede deshacer.`)) return;
                try { await D.auth.manage({ action: "delete", userId: a.id }); toast("Cuenta eliminada."); } catch (x) { fail(x); }
                load();
              } }, "Eliminar")));
        }) : h("p", { class: "empty" }, "Cargando cuentas…")),
        h("div", { class: "grid g3", style: "margin-top:16px" }, [["Administrador", "Publica, edita y elimina contenido."], ["Editor", "Publica y edita, sin eliminar."], ["Consulta", "Revisa el panel sin hacer cambios."]].map(([t, d]) => h("div", { class: "stat" }, h("b", { style: "font-size:1.6rem;color:var(--fg)" }, t), h("span", { style: "text-transform:none;letter-spacing:0;font-weight:400" }, d))))
      ].filter(Boolean));
    }
    draw(); load();
    return root;
  };

  // Primer ingreso con contraseña temporal: obliga a crear una propia antes de usar el panel.
  function changePasswordView() {
    const p1 = h("input", { type: "password", autocomplete: "new-password", minlength: 8, maxlength: 72 });
    const p2 = h("input", { type: "password", autocomplete: "new-password", minlength: 8, maxlength: 72 });
    const err = h("p", { class: "help", style: "color:var(--red);min-height:1.2em" });
    const submit = h("button", { class: "btn btn--gold", style: "width:100%" }, "Guardar contraseña y entrar");
    app.replaceChildren(h("div", { class: "login" }, h("form", { class: "login__box", novalidate: true, onsubmit: async e => {
      e.preventDefault(); err.textContent = "";
      if (p1.value.length < 8) return (err.textContent = "La contraseña debe tener al menos 8 caracteres.");
      if (!/[A-Za-z]/.test(p1.value) || !/\d/.test(p1.value)) return (err.textContent = "Incluye al menos una letra y un número.");
      if (p1.value !== p2.value) return (err.textContent = "Las contraseñas no coinciden.");
      submit.disabled = true;
      try { await D.auth.changePassword(p1.value); toast("Contraseña actualizada."); start(); }
      catch (x) { err.textContent = x.message; submit.disabled = false; }
    } },
      h("div", { class: "login__brand" }, h("img", { src: "../assets/escudo.webp", alt: "" }), h("div", {}, h("b", {}, "CORONELAS"), h("small", {}, "Academia Elite"))),
      h("h1", {}, "Crea tu contraseña"),
      h("p", { class: "help" }, "Entraste con una contraseña temporal. Elige una propia para continuar: mínimo 8 caracteres, con letras y números."),
      f("Nueva contraseña", p1), f("Repite la contraseña", p2), err, submit,
      h("button", { type: "button", class: "btn", style: "width:100%", onclick: async () => { await D.auth.signOut(); start(); } }, "Salir"))));
  }

  // ───────── Avisos y comunicados ─────────
  // Teléfono mexicano de 10 dígitos → 52XXXXXXXXXX (formato de wa.me). Cadena vacía si no es utilizable.
  const phoneMx = raw => { let d = String(raw || "").replace(/\D/g, ""); if (d.length === 10) d = "52" + d; else if (d.length === 13 && d.startsWith("521")) d = "52" + d.slice(3); return d.length === 12 && d.startsWith("52") ? d : ""; };
  const siteLink = path => new URL("../" + path, location.href).href;
  const copyText = async (text, ok) => { try { await navigator.clipboard.writeText(text); toast(ok); } catch { toast("No se pudo copiar; selecciona el texto manualmente.", true); } };
  const dayEs = d => (d ? new Date(d + "T12:00:00").toLocaleDateString("es-MX", { dateStyle: "long" }) : "");

  sections.avisos = () => {
    const root = h("div"); let rows = [], editing = null, sending = null, features = { notices: true };
    async function load() {
      try { [rows, features] = await Promise.all([D.list("notices", { orderBy: "publish_date", asc: false }), D.getSetting("features", { notices: true })]); } catch (e) { fail(e); }
      draw();
    }

    function featurePanel() {
      const on = features.notices !== false;
      return h("div", { class: "panel", style: "border-top-width:1px;gap:10px" },
        h("div", { class: "bar", style: "margin:0" },
          h("b", {}, "Sección pública de avisos:"), h("span", { class: "tag " + (on ? "tag--ok" : "") }, on ? "activada" : "desactivada"),
          canAdmin() ? h("button", { class: "btn btn--sm", onclick: async () => {
            if (on && !confirm("¿Desactivar la sección de avisos? Dejará de verse en el sitio, incluso para quien tenga el enlace.")) return;
            try { await D.setSetting("features", { ...features, notices: !on }); toast(on ? "Sección desactivada." : "Sección activada."); } catch (e) { fail(e); }
            load();
          } }, on ? "Desactivar" : "Activar") : h("span", { class: "help" }, "Solo un administrador puede activarla o desactivarla.")),
        h("p", { class: "help", style: "margin:0" }, on
          ? "Los avisos publicados se ven en avisos.html y aparece el enlace “Avisos” en el menú del sitio."
          : "Mientras esté desactivada nadie puede ver los avisos en el sitio. Puedes seguir creándolos y editándolos aquí."));
    }

    function form(row) {
      const d = { ...row }; const rte = richEditor(d.content, false);
      const err = h("p", { class: "help", style: "color:var(--red)" });
      return h("form", { class: "panel", novalidate: true, onsubmit: async e => {
        e.preventDefault();
        d.content = rte.html(); d.title = (d.title || "").trim(); d.summary = (d.summary || "").trim(); d.audience = (d.audience || "").trim();
        if (!d.title) return (err.textContent = "Falta el título.");
        if (d.status === "published" && !d.content.replace(/<[^>]*>/g, "").trim() && !/<img/.test(d.content)) return (err.textContent = "Escribe el contenido antes de publicar.");
        try { await D.save("notices", d); editing = null; toast(d.status === "published" ? "Aviso publicado." : "Borrador guardado."); load(); } catch (x) { err.textContent = x.message; }
      } },
        h("h3", {}, d.id ? "Editar aviso" : "Nuevo aviso"),
        f("Título", h("input", { value: d.title || "", maxlength: 160, oninput: e => (d.title = e.target.value) })),
        f("Resumen corto", h("textarea", { value: d.summary || "", maxlength: 300, oninput: e => (d.summary = e.target.value) }), "Aparece en la lista de avisos y en los mensajes de WhatsApp o correo."),
        f("Contenido", rte.el),
        h("div", { class: "grid g3" },
          f("Dirigido a", h("input", { value: d.audience || "", maxlength: 80, placeholder: "Ej. Todos, Cadete, Juvenil", oninput: e => (d.audience = e.target.value) }), "Opcional. Si coincide con un grupo, se preselecciona al enviar."),
          f("Fecha", h("input", { type: "date", value: d.publish_date || "", oninput: e => (d.publish_date = e.target.value) })),
          f("Estado", h("select", { onchange: e => (d.status = e.target.value) }, h("option", { value: "draft", selected: d.status !== "published" }, "Borrador"), h("option", { value: "published", selected: d.status === "published" }, "Publicado")))),
        check("Fijar arriba en la lista", !!d.pinned, e => (d.pinned = e.target.checked)),
        err, h("div", { class: "bar", style: "margin:0" }, h("button", { class: "btn btn--gold" }, "Guardar"), h("button", { type: "button", class: "btn", onclick: () => { editing = null; draw(); } }, "Cancelar")));
    }

    // ── Envío a padres de familia ──
    function sendView(n) {
      const link = siteLink("avisos.html?id=" + encodeURIComponent(n.id));
      const st = { msg: `Hola {nombre}, aviso de Academia Elite:\n*${n.title}*\n${n.summary ? n.summary + "\n" : ""}Léelo completo aquí: ${link}`, src: "all", group: "all" };
      const sel = new Set(), done = new Set(); let people = [], ready = false;
      const wrap = h("div");
      const msgFor = p => st.msg.replaceAll("{nombre}", p && p.name ? p.name : "familia");
      const visible = () => people.filter(p => (st.src === "all" || p.src === st.src) && (st.group === "all" || p.group === st.group));
      const chosen = () => visible().filter(p => sel.has(p.id));
      const pick = () => { sel.clear(); visible().forEach(p => sel.add(p.id)); };

      (async () => {
        let enr = [], con = [];
        try { enr = await D.list("enrollments"); } catch {}
        try { con = canAdmin() ? await D.list("contacts") : []; } catch {}
        const seen = new Set();
        con.filter(c => c.active !== false).forEach(c => { const ph = phoneMx(c.phone); people.push({ id: "c" + c.id, name: c.parent_name, player: c.player_name, phone: ph, email: (c.email || "").trim(), group: c.group_name || "", src: "Contactos" }); if (ph) seen.add(ph); });
        enr.filter(x => x.status === "enrolled").forEach(x => { const ph = phoneMx(x.phone); if (ph && seen.has(ph)) return; people.push({ id: "e" + x.id, name: x.guardian_first || x.guardian, player: x.player_name, phone: ph, email: "", group: x.category || "", src: "Inscritas" }); });
        const g = people.map(p => p.group).find(x => x && n.audience && x.toLowerCase() === n.audience.trim().toLowerCase());
        if (g) st.group = g;
        pick(); ready = true; draw();
      })();

      function draw() {
        const groups = [...new Set(people.map(p => p.group).filter(Boolean))].sort();
        const vis = visible(), ch = chosen();
        const emails = [...new Set(ch.map(p => p.email).filter(Boolean))];
        const bcc = () => {
          const body = msgFor(null).replace(/^Hola familia, (\w)/, (_, c) => c.toUpperCase());
          const href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent("Aviso: " + n.title)}&body=${encodeURIComponent(body)}`;
          if (href.length > 1900) return null;
          return href;
        };
        const mailHref = bcc();
        wrap.replaceChildren(
          h("div", { class: "bar" }, h("button", { class: "btn", onclick: () => { sending = null; draw0(); } }, "← Volver a avisos")),
          h("div", { class: "panel", style: "border-top-width:1px;gap:12px" },
            h("h3", {}, "Enviar: " + n.title),
            n.status !== "published" ? h("div", { class: "notice" }, "Este aviso está en borrador: el enlace no abrirá hasta que lo publiques.") : null,
            features.notices === false ? h("div", { class: "notice" }, "La sección de avisos está desactivada: el enlace mostrará “no disponible” hasta que se active.") : null,
            f("Mensaje", h("textarea", { rows: 6, value: st.msg, maxlength: 1000, oninput: e => (st.msg = e.target.value) }), "{nombre} se reemplaza por el nombre del padre o tutor. Edítalo como quieras."),
            h("div", { class: "bar", style: "margin:0" },
              h("button", { class: "btn", onclick: () => copyText(link, "Enlace copiado.") }, "Copiar enlace"),
              h("button", { class: "btn", onclick: () => copyText(msgFor(null), "Mensaje copiado.") }, "Copiar mensaje"),
              h("a", { class: "btn btn--gold", href: "https://wa.me/?text=" + encodeURIComponent(msgFor(null)), target: "_blank", rel: "noopener" }, "Compartir por WhatsApp"),
              h("span", { class: "help" }, "Para un chat o grupo: WhatsApp te deja elegir el destino."))),
          h("div", { class: "panel", style: "border-top-width:1px;gap:12px" },
            h("h3", {}, "Enviar a cada padre de familia"),
            !ready ? h("p", { class: "help" }, "Cargando destinatarios…") : !people.length ? h("p", { class: "empty" }, canAdmin() ? "Aún no hay destinatarios. Agrega padres en “Padres de familia” o marca solicitudes como Inscrita." : "Aún no hay destinatarios. Marca solicitudes como Inscrita; la lista de contactos solo la ve un administrador.") : [
              h("div", { class: "bar", style: "margin:0" },
                h("select", { class: "inp", style: "width:auto", "aria-label": "Origen", onchange: e => { st.src = e.target.value; pick(); draw(); } },
                  [["all", "Todos los orígenes"], ["Inscritas", "Solicitudes inscritas"], ["Contactos", "Lista de contactos"]].map(([v, l]) => h("option", { value: v, selected: st.src === v }, l))),
                h("select", { class: "inp", style: "width:auto", "aria-label": "Grupo", onchange: e => { st.group = e.target.value; pick(); draw(); } },
                  h("option", { value: "all" }, "Todos los grupos"), groups.map(g => h("option", { value: g, selected: st.group === g }, g))),
                h("label", { class: "f f--check" }, h("input", { type: "checkbox", checked: vis.length > 0 && ch.length === vis.length, onchange: e => { vis.forEach(p => (e.target.checked ? sel.add(p.id) : sel.delete(p.id))); draw(); } }), "Seleccionar todos")),
              h("div", { class: "bar", style: "margin:0" },
                mailHref ? h("a", { class: "btn", href: mailHref }, `Correo a ${emails.length} (CCO)`) : h("button", { class: "btn", disabled: !emails.length, onclick: () => copyText(emails.join(", "), "Correos copiados. Pégalos en el campo CCO de tu correo.") }, emails.length ? "Copiar correos (son muchos para abrir el correo)" : "Sin correos en la selección"),
                emails.length && mailHref ? h("button", { class: "btn", onclick: () => copyText(emails.join(", "), "Correos copiados.") }, "Copiar correos") : null,
                h("span", { class: "help" }, `${ch.length} seleccionado${ch.length === 1 ? "" : "s"} de ${vis.length}. Los correos se envían con copia oculta.`)),
              vis.length ? h("div", { class: "list" }, vis.map(p => h("div", { class: "row row--sel" },
                h("input", { type: "checkbox", checked: sel.has(p.id), "aria-label": "Seleccionar " + p.name, style: "width:18px;height:18px;accent-color:var(--gold)", onchange: e => { e.target.checked ? sel.add(p.id) : sel.delete(p.id); draw(); } }),
                h("div", { class: "thumb" }, (p.name || "?").charAt(0).toUpperCase()),
                h("div", { style: "min-width:0" }, h("div", { class: "row__t" }, p.name, p.group ? h("span", { class: "tag" }, p.group) : null, done.has(p.id) ? h("span", { class: "tag tag--ok" }, "WhatsApp abierto") : null),
                  h("div", { class: "row__s" }, [p.player ? "Jugadora: " + p.player : "", p.phone ? "+" + p.phone : "sin teléfono válido", p.email || "sin correo"].filter(Boolean).join(" · "))),
                h("div", { class: "row__a" },
                  p.phone ? h("a", { class: "btn btn--sm", href: `https://wa.me/${p.phone}?text=${encodeURIComponent(msgFor(p))}`, target: "_blank", rel: "noopener", onclick: () => { done.add(p.id); setTimeout(draw, 50); } }, "WhatsApp") : null,
                  p.email ? h("a", { class: "btn btn--sm", href: `mailto:${p.email}?subject=${encodeURIComponent("Aviso: " + n.title)}&body=${encodeURIComponent(msgFor(p))}` }, "Correo") : null)))) : h("p", { class: "empty" }, "Nadie coincide con ese filtro.")]));
      }
      draw();
      return wrap;
    }

    function draw0() { draw(); }
    function draw() {
      root.replaceChildren();
      if (editing) return root.append(form(editing));
      if (sending) return root.append(sendView(sending));
      root.append(featurePanel());
      if (canEdit()) root.append(h("div", { class: "bar" }, h("button", { class: "btn btn--gold", onclick: () => { editing = { title: "", summary: "", content: "", audience: "", status: "draft", pinned: false, publish_date: new Date().toISOString().slice(0, 10) }; draw(); } }, "+ Nuevo aviso")));
      if (!rows.length) return root.append(h("div", { class: "list" }, h("p", { class: "empty" }, "Aún no hay avisos. Crea uno para publicar comunicados o informes a los padres de familia.")));
      root.append(h("div", { class: "list" }, rows.map(r => h("div", { class: "row" },
        h("div", { class: "thumb" }, "📢"),
        h("div", { style: "min-width:0" },
          h("div", { class: "row__t" }, r.title, h("span", { class: "tag " + (r.status === "published" ? "tag--ok" : "") }, r.status === "published" ? "publicado" : "borrador"), r.pinned ? h("span", { class: "tag tag--gold" }, "fijado") : null, r.audience ? h("span", { class: "tag" }, r.audience) : null),
          h("div", { class: "row__s" }, [dayEs(r.publish_date), r.summary].filter(Boolean).join(" · "))),
        h("div", { class: "row__a" },
          r.status === "published" ? h("a", { class: "btn btn--sm", href: "../avisos.html?id=" + encodeURIComponent(r.id), target: "_blank", rel: "noopener" }, "Ver") : null,
          canEdit() ? h("button", { class: "btn btn--sm btn--gold", onclick: () => { sending = r; draw(); } }, "Enviar") : null,
          canEdit() ? h("button", { class: "btn btn--sm", onclick: () => { editing = r; draw(); } }, "Editar") : null,
          canAdmin() ? h("button", { class: "btn btn--sm btn--danger", onclick: async () => { if (!confirm(`¿Eliminar el aviso "${r.title}"?`)) return; try { await D.remove("notices", r.id); toast("Aviso eliminado."); } catch (e) { fail(e); } load(); } }, "Eliminar") : null)))));
    }
    load();
    return root;
  };

  // ───────── Padres de familia (contactos para avisos) ─────────
  sections.contactos = () => {
    const root = h("div");
    if (!canAdmin()) return h("div", { class: "notice" }, "Solo los administradores pueden ver la lista de padres de familia.");
    let rows = [], editing = null, q = "", grp = "all";
    const file = h("input", { type: "file", accept: ".xlsx,.xls,.csv", class: "hidden" });
    async function load() { try { rows = (await D.list("contacts")).sort((a, b) => a.parent_name.localeCompare(b.parent_name, "es")); } catch (e) { fail(e); } draw(); }

    const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const COLS = { parent_name: ["padre", "tutor", "padre o tutor", "madre", "responsable", "nombre"], player_name: ["jugadora", "alumna", "hija", "deportista"], phone: ["telefono", "celular", "tel", "whatsapp", "movil"], email: ["correo", "email", "e-mail", "correo electronico"], group_name: ["grupo", "categoria"] };
    file.addEventListener("change", async () => {
      const fl = file.files[0]; if (!fl) return;
      try {
        if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel. Revisa tu conexión.");
        const wb = XLSX.read(await fl.arrayBuffer(), { type: "array" });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
        if (data.length < 2) throw new Error("El archivo no tiene filas.");
        const head = data[0].map(norm), idx = {};
        for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex(x => names.includes(x));
        if (idx.parent_name < 0) throw new Error("No encontré la columna “Padre o tutor”. Usa los encabezados: Padre o tutor, Jugadora, Teléfono, Correo, Grupo.");
        const items = data.slice(1).map(r => ({ parent_name: String(r[idx.parent_name] || "").trim().slice(0, 120), player_name: idx.player_name < 0 ? "" : String(r[idx.player_name] || "").trim().slice(0, 120), phone: idx.phone < 0 ? "" : String(r[idx.phone] || "").trim().slice(0, 30), email: idx.email < 0 ? "" : String(r[idx.email] || "").trim().slice(0, 160), group_name: idx.group_name < 0 ? "" : String(r[idx.group_name] || "").trim().slice(0, 80), active: true })).filter(r => r.parent_name).slice(0, 500);
        if (!items.length) throw new Error("No hay filas con nombre de padre o tutor.");
        if (!confirm(`Se importarán ${items.length} contacto${items.length === 1 ? "" : "s"}. ¿Continuar?`)) return;
        toast("Importando…");
        for (const it of items) await D.save("contacts", it);
        toast(`${items.length} contactos importados.`);
      } catch (e) { fail(e); } finally { file.value = ""; load(); }
    });

    function form(row) {
      const d = { ...row }; const err = h("p", { class: "help", style: "color:var(--red)" });
      return h("form", { class: "panel", novalidate: true, onsubmit: async e => {
        e.preventDefault();
        if (!(d.parent_name || "").trim()) return (err.textContent = "Falta el nombre del padre o tutor.");
        if (d.email && !/^\S+@\S+\.\S+$/.test(d.email.trim())) return (err.textContent = "El correo no es válido.");
        if (d.phone && !phoneMx(d.phone)) return (err.textContent = "El teléfono debe tener 10 dígitos (lada + número).");
        try { await D.save("contacts", { ...d, parent_name: d.parent_name.trim(), email: (d.email || "").trim() }); editing = null; toast("Contacto guardado."); load(); } catch (x) { err.textContent = x.message; }
      } },
        h("h3", {}, d.id ? "Editar contacto" : "Nuevo contacto"),
        h("div", { class: "grid g2" },
          f("Padre, madre o tutor", h("input", { value: d.parent_name || "", maxlength: 120, oninput: e => (d.parent_name = e.target.value) })),
          f("Jugadora", h("input", { value: d.player_name || "", maxlength: 120, oninput: e => (d.player_name = e.target.value) })),
          f("Teléfono (WhatsApp)", h("input", { type: "tel", value: d.phone || "", maxlength: 30, placeholder: "10 dígitos", oninput: e => (d.phone = e.target.value) })),
          f("Correo", h("input", { type: "email", value: d.email || "", maxlength: 160, oninput: e => (d.email = e.target.value) })),
          f("Grupo o categoría", h("input", { value: d.group_name || "", maxlength: 80, placeholder: "Ej. Cadete", oninput: e => (d.group_name = e.target.value) }))),
        check("Recibe avisos", d.active !== false, e => (d.active = e.target.checked)),
        err, h("div", { class: "bar", style: "margin:0" }, h("button", { class: "btn btn--gold" }, "Guardar"), h("button", { type: "button", class: "btn", onclick: () => { editing = null; draw(); } }, "Cancelar")));
    }

    function draw() {
      root.replaceChildren();
      if (editing) return root.append(form(editing));
      const groups = [...new Set(rows.map(r => r.group_name).filter(Boolean))].sort();
      const shown = rows.filter(r => (grp === "all" || r.group_name === grp) && (!q || norm([r.parent_name, r.player_name, r.phone, r.email].join(" ")).includes(norm(q))));
      root.append(h("div", { class: "bar" },
        h("button", { class: "btn btn--gold", onclick: () => { editing = { parent_name: "", player_name: "", phone: "", email: "", group_name: "", active: true }; draw(); } }, "+ Agregar contacto"),
        h("button", { class: "btn", onclick: () => file.click() }, "Importar Excel/CSV"), file,
        h("span", { class: "help" }, "Columnas: Padre o tutor, Jugadora, Teléfono, Correo, Grupo.")),
        rows.length ? h("div", { class: "bar" },
          h("input", { class: "inp", type: "search", value: q, placeholder: "Buscar…", style: "max-width:260px", oninput: e => { q = e.target.value; const pos = e.target.selectionStart; draw(); const i = root.querySelector("input[type=search]"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } }),
          h("select", { class: "inp", style: "width:auto", "aria-label": "Grupo", onchange: e => { grp = e.target.value; draw(); } }, h("option", { value: "all" }, "Todos los grupos"), groups.map(g => h("option", { value: g, selected: grp === g }, g))),
          h("span", { class: "help" }, `${shown.length} de ${rows.length}`)) : null,
        rows.length ? h("div", { class: "list" }, shown.length ? shown.map(r => h("div", { class: "row" },
          h("div", { class: "thumb" }, (r.parent_name || "?").charAt(0).toUpperCase()),
          h("div", { style: "min-width:0" }, h("div", { class: "row__t" }, r.parent_name, r.group_name ? h("span", { class: "tag" }, r.group_name) : null, r.active === false ? h("span", { class: "tag" }, "sin avisos") : null),
            h("div", { class: "row__s" }, [r.player_name ? "Jugadora: " + r.player_name : "", r.phone, r.email].filter(Boolean).join(" · ") || "Sin datos de contacto")),
          h("div", { class: "row__a" },
            h("button", { class: "btn btn--sm", onclick: () => { editing = r; draw(); } }, "Editar"),
            h("button", { class: "btn btn--sm btn--danger", onclick: async () => { if (!confirm(`¿Eliminar a ${r.parent_name}?`)) return; try { await D.remove("contacts", r.id); toast("Contacto eliminado."); } catch (e) { fail(e); } load(); } }, "Eliminar")))) : h("p", { class: "empty" }, "Nadie coincide con la búsqueda."))
          : h("div", { class: "list" }, h("p", { class: "empty" }, "Aún no hay contactos. Agrégalos uno por uno o impórtalos desde Excel. También puedes enviar avisos a las solicitudes marcadas como Inscrita.")));
    }
    load();
    return root;
  };

  const NAV = [["resumen", "Resumen"], ["general", "Información general"], ["redes", "Redes sociales"], ["imagenes", "Imágenes de portada"], ["categorias", "Categorías"], ["horarios", "Horarios"], ["entrenadores", "Entrenadores"], ["galeria", "Galerías"], ["paginas", "Páginas"], ["faq", "Preguntas frecuentes"], ["avisos", "Avisos"], ["solicitudes", "Solicitudes"], ["contactos", "Padres de familia"], ["cuentas", "Cuentas y permisos"]];

  // ───────── estructura ─────────
  function go(tab) { S.tab = tab; shell(); }

  function shell() {
    const nav = NAV.filter(([k]) => (k !== "cuentas" || isSuper()) && (k !== "contactos" || canAdmin()));
    if (S.tab === "contactos" && !canAdmin()) S.tab = "resumen";
    if (S.tab === "cuentas" && !isSuper()) S.tab = "resumen";
    const title = (NAV.find(n => n[0] === S.tab) || NAV[0])[1];
    const note = S.role === "pending" ? "Tu cuenta está pendiente de aprobación. El superadministrador debe asignarte un permiso para ver el contenido interno."
      : !canEdit() ? "Tu cuenta tiene acceso de consulta. Un administrador debe asignarte permisos de edición." : "";
    app.replaceChildren(...[
      D.auth.demo ? h("div", { class: "demo" }, "Modo demostración: los datos se guardan solo en este navegador. Conecta Supabase en config.js para publicarlos de verdad.") : null,
      h("header", { class: "top" }, h("div", { class: "top__in" },
        h("a", { class: "top__brand", href: "../index.html", title: "Ir al sitio", "aria-label": "Ir al sitio de Academia Elite" }, h("img", { src: "../assets/escudo.webp", alt: "" }), h("div", {}, h("p", {}, "Academia Elite"), h("h1", {}, "Administración"))),
        h("div", { class: "top__act" }, S.user ? h("span", { class: "help" }, S.user.email) : null, h("a", { class: "btn btn--sm", href: "../index.html", target: "_blank", rel: "noopener" }, "Ver sitio"), h("button", { class: "btn btn--sm", onclick: async () => { await D.auth.signOut(); S.role = "none"; start(); } }, "Salir")))),
      h("div", { class: "stripe" }),
      h("div", { class: "shell" },
        h("nav", { class: "side", "aria-label": "Secciones" }, nav.map(([k, l]) => h("button", { "aria-current": S.tab === k ? "true" : "false", onclick: () => go(k) }, l))),
        h("main", { class: "main" }, h("p", { class: "role" }, "Rol: " + (ROLE_LABEL[S.role] || S.role)), h("h2", {}, title),
          note ? h("div", { class: "notice" }, note) : null,
          S.role === "pending" ? null : (sections[S.tab] || sections.resumen)()))].filter(Boolean));
  }

  function loginView() {
    let mode = "in";
    const err = h("p", { class: "help", style: "color:var(--red);min-height:1.2em" });
    const email = h("input", { type: "email", autocomplete: "email", required: true });
    const pass = h("input", { type: "password", autocomplete: "current-password", required: true, minlength: 8 });
    const submit = h("button", { class: "btn btn--gold", style: "width:100%" }, "Entrar");
    const alt = h("button", { type: "button", class: "btn", style: "width:100%" }, "Crear cuenta");
    const title = h("h1", {}, "Acceso");
    const sync = () => { title.textContent = mode === "in" ? "Acceso" : "Crear cuenta"; submit.textContent = mode === "in" ? "Entrar" : "Crear cuenta"; alt.textContent = mode === "in" ? "Crear cuenta" : "Ya tengo cuenta"; pass.autocomplete = mode === "in" ? "current-password" : "new-password"; err.textContent = ""; };
    alt.onclick = () => { mode = mode === "in" ? "up" : "in"; sync(); };
    app.replaceChildren(h("div", { class: "login" }, h("form", { class: "login__box", onsubmit: async e => {
      e.preventDefault(); submit.disabled = true; err.textContent = "";
      try {
        if (mode === "up") { const r = await D.auth.signUp(email.value.trim(), pass.value); if (r.confirm) { err.style.color = "var(--ok)"; err.textContent = "Cuenta creada. Revisa tu correo para confirmarla y luego entra."; submit.disabled = false; mode = "in"; sync(); err.textContent = "Cuenta creada. Revisa tu correo para confirmarla y luego entra."; return; } }
        else await D.auth.signIn(email.value.trim(), pass.value);
        start();
      } catch (x) { err.style.color = "var(--red)"; err.textContent = x.message; submit.disabled = false; }
    } },
      h("div", { class: "login__brand" }, h("img", { src: "../assets/escudo.webp", alt: "" }), h("div", {}, h("b", {}, "CORONELAS"), h("small", {}, "Academia Elite"))),
      title,
      D.auth.demo ? h("p", { class: "help" }, "Modo demostración: escribe cualquier correo y contraseña de 8+ caracteres para entrar.") : null,
      f("Correo", email), f("Contraseña", pass), err, submit, alt)));
  }

  async function start() {
    try {
      S.user = await D.auth.user();
      if (!S.user) return loginView();
      const st = await D.auth.status();
      S.role = st.role;
      if (st.mustChange) return changePasswordView();
      shell();
    } catch (e) { loginView(); fail(e); }
  }
  start();
})();
