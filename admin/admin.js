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
      const [cat, coa, pho, pag, enr] = await Promise.all(["categories", "coaches", "photos", "pages", "enrollments"].map(t => D.list(t).catch(() => [])));
      root.append(h("div", { class: "stats" },
        [[enr.filter(e => e.status === "new").length, "Solicitudes nuevas"], [cat.length, "Categorías"], [coa.length, "Entrenadores"], [pho.length, "Fotografías"], [pag.length, "Páginas"]]
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

  sections.galeria = () => {
    const root = h("div"); let rows = [];
    const ed = canEdit();
    const input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, class: "hidden" });
    async function load() { try { rows = await D.list("photos"); } catch (e) { fail(e); } draw(); }
    async function upd(r, patch, msg) { try { await D.save("photos", { ...r, ...patch }); if (msg) toast(msg); } catch (e) { fail(e); } load(); }
    function draw() {
      root.replaceChildren(...[
        ed ? h("div", { class: "bar" }, h("button", { class: "btn btn--gold", onclick: () => input.click() }, "+ Subir fotografías"), h("span", { class: "help" }, "Puedes elegir varias a la vez."), input) : null,
        rows.length ? h("div", { class: "photos" }, rows.map((r, i) => h("div", { class: "ph" + (r.active === false ? " off" : "") }, h("img", { src: r.url, alt: r.caption || "", loading: "lazy" }),
          h("div", { class: "ph__b" },
            h("input", { class: "inp", value: r.caption || "", maxlength: 200, placeholder: "Pie de foto", disabled: !ed, onchange: e => upd(r, { caption: e.target.value.trim() }, "Pie de foto guardado.") }),
            ed ? h("div", { class: "ph__a" },
              h("button", { class: "btn btn--sm btn--icon", disabled: i === 0, onclick: async () => { const p = rows[i - 1]; await D.save("photos", { ...p, display_order: i }); await D.save("photos", { ...r, display_order: i - 1 }); load(); } }, "←"),
              h("button", { class: "btn btn--sm btn--icon", disabled: i === rows.length - 1, onclick: async () => { const n = rows[i + 1]; await D.save("photos", { ...n, display_order: i }); await D.save("photos", { ...r, display_order: i + 1 }); load(); } }, "→"),
              h("button", { class: "btn btn--sm", onclick: () => upd(r, { active: r.active === false }) }, r.active === false ? "Mostrar" : "Ocultar"),
              canAdmin() ? h("button", { class: "btn btn--sm btn--danger", onclick: async () => { if (!confirm("¿Eliminar esta fotografía?")) return; try { await D.remove("photos", r.id); toast("Eliminada."); } catch (e) { fail(e); } load(); } }, "Eliminar") : null) : null))))
          : h("div", { class: "list" }, h("p", { class: "empty" }, "Aún no hay fotografías. Cuando subas la primera aparecerá la sección “Galería” en el sitio."))].filter(Boolean));
    }
    input.addEventListener("change", async () => {
      try {
        toast("Subiendo fotografías…");
        let n = rows.length;
        for (const file of input.files) { const url = await D.uploadImage(file, "galeria"); await D.save("photos", { url, caption: "", album: "", display_order: n++, active: true }); }
        toast("Fotografías agregadas.");
      } catch (e) { fail(e); } finally { input.value = ""; load(); }
    });
    load();
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
    const root = h("div"); let rows = [];
    const ST = { new: "Nueva", contacted: "Contactada", enrolled: "Inscrita", discarded: "Descartada" };
    async function load() { try { rows = await D.list("enrollments"); } catch (e) { fail(e); } draw(); }
    const HEAD = ["Fecha", "Nombre(s) jugadora", "Apellido paterno", "Apellido materno", "Edad", "Categoría", "Nombre(s) tutor", "Apellido paterno tutor", "Apellido materno tutor", "Teléfono", "Estado"];
    const table = () => rows.map(r => [fmtDate(r.created_at), r.player_first || r.player_name, r.player_paternal, r.player_maternal, r.age, r.category, r.guardian_first || r.guardian, r.guardian_paternal, r.guardian_maternal, r.phone, ST[r.status]].map(v => v ?? ""));
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
      root.replaceChildren(...[rows.length && canAdmin() ? h("div", { class: "bar" }, h("button", { class: "btn", onclick: xlsx }, "Exportar Excel (.xlsx)"), h("button", { class: "btn", onclick: csv }, "Exportar CSV"), h("span", { class: "help" }, `${rows.length} solicitud${rows.length === 1 ? "" : "es"}`)) : null,
        rows.length ? h("div", { class: "list" }, rows.map(r => h("div", { class: "row" },
          h("div", { class: "thumb" }, (r.player_name || "?").charAt(0)),
          h("div", { style: "min-width:0" }, h("div", { class: "row__t" }, r.player_name, h("span", { class: "tag" }, `${r.age} años · ${r.category || "sin categoría"}`)),
            h("div", { class: "row__s" }, `Tutor: ${r.guardian} · `, h("a", { href: "tel:" + String(r.phone).replace(/[^\d+]/g, "") }, r.phone), ` · ${fmtDate(r.created_at)}`)),
          h("div", { class: "row__a" },
            h("select", { class: "inp", style: "width:auto", disabled: !canEdit(), "aria-label": "Estado", onchange: async e => { try { await D.save("enrollments", { ...r, status: e.target.value }); toast("Estado actualizado."); } catch (x) { fail(x); } load(); } },
              Object.entries(ST).map(([v, l]) => h("option", { value: v, selected: r.status === v }, l))),
            canAdmin() ? h("button", { class: "btn btn--sm btn--danger", onclick: async () => { if (!confirm("¿Eliminar esta solicitud?")) return; try { await D.remove("enrollments", r.id); } catch (x) { fail(x); } load(); } }, "Eliminar") : null))))
          : h("div", { class: "list" }, h("p", { class: "empty" }, "Aún no hay solicitudes de clase de prueba."))].filter(Boolean));
    }
    load();
    return root;
  };

  sections.cuentas = () => {
    const root = h("div");
    D.auth.accounts().then(list => {
      root.append(h("div", { class: "notice" }, "Las cuentas nuevas quedan pendientes y no ven contenido interno hasta que les asignes un permiso."),
        h("div", { class: "list" }, list.map(a => h("div", { class: "row" },
          h("div", { class: "thumb" }, (a.email || "?").charAt(0).toUpperCase()),
          h("div", { class: "row__t" }, a.email),
          a.role === "super_admin" ? h("span", { class: "tag tag--gold" }, "Superadministrador") :
            h("select", { class: "inp", style: "width:auto", "aria-label": "Permiso de " + a.email, onchange: async e => { try { await D.auth.setRole(a.id, e.target.value); toast("Permiso actualizado."); } catch (x) { fail(x); } } },
              [["pending", "Pendiente"], ["admin", "Administrador"], ["editor", "Editor"], ["viewer", "Consulta"]].map(([v, l]) => h("option", { value: v, selected: a.role === v }, l)))))),
        h("div", { class: "grid g3", style: "margin-top:16px" }, [["Administrador", "Publica, edita y elimina contenido."], ["Editor", "Publica y edita, sin eliminar."], ["Consulta", "Revisa el panel sin hacer cambios."]].map(([t, d]) => h("div", { class: "stat" }, h("b", { style: "font-size:1.6rem;color:var(--fg)" }, t), h("span", { style: "text-transform:none;letter-spacing:0;font-weight:400" }, d)))));
    }).catch(e => root.append(h("p", { class: "notice" }, e.message)));
    return root;
  };

  const NAV = [["resumen", "Resumen"], ["general", "Información general"], ["redes", "Redes sociales"], ["imagenes", "Imágenes de portada"], ["categorias", "Categorías"], ["horarios", "Horarios"], ["entrenadores", "Entrenadores"], ["galeria", "Galería de fotos"], ["paginas", "Páginas"], ["faq", "Preguntas frecuentes"], ["solicitudes", "Solicitudes"], ["cuentas", "Cuentas y permisos"]];

  // ───────── estructura ─────────
  function go(tab) { S.tab = tab; shell(); }

  function shell() {
    const nav = NAV.filter(([k]) => k !== "cuentas" || isSuper());
    const title = (NAV.find(n => n[0] === S.tab) || NAV[0])[1];
    const note = S.role === "pending" ? "Tu cuenta está pendiente de aprobación. El superadministrador debe asignarte un permiso para ver el contenido interno."
      : !canEdit() ? "Tu cuenta tiene acceso de consulta. Un administrador debe asignarte permisos de edición." : "";
    app.replaceChildren(
      D.auth.demo ? h("div", { class: "demo" }, "Modo demostración: los datos se guardan solo en este navegador. Conecta Supabase en config.js para publicarlos de verdad.") : null,
      h("header", { class: "top" }, h("div", { class: "top__in" },
        h("div", { class: "top__brand" }, h("img", { src: "../assets/escudo.webp", alt: "" }), h("div", {}, h("p", {}, "Academia Elite"), h("h1", {}, "Administración"))),
        h("div", { class: "top__act" }, S.user ? h("span", { class: "help" }, S.user.email) : null, h("a", { class: "btn btn--sm", href: "../index.html", target: "_blank", rel: "noopener" }, "Ver sitio"), h("button", { class: "btn btn--sm", onclick: async () => { await D.auth.signOut(); S.role = "none"; start(); } }, "Salir")))),
      h("div", { class: "stripe" }),
      h("div", { class: "shell" },
        h("nav", { class: "side", "aria-label": "Secciones" }, nav.map(([k, l]) => h("button", { "aria-current": S.tab === k ? "true" : "false", onclick: () => go(k) }, l))),
        h("main", { class: "main" }, h("p", { class: "role" }, "Rol: " + (ROLE_LABEL[S.role] || S.role)), h("h2", {}, title),
          note ? h("div", { class: "notice" }, note) : null,
          S.role === "pending" ? null : (sections[S.tab] || sections.resumen)())));
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
      S.role = await D.auth.role();
      shell();
    } catch (e) { loginView(); fail(e); }
  }
  start();
})();
