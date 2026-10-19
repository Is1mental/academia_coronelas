// Contenido dinámico del sitio público. Si no hay datos, se conserva el HTML por defecto.
(async () => {
  const D = window.AcademiaData;
  if (!D) return;
  const $ = (s, r = document) => r.querySelector(s);
  const on = location.pathname.endsWith("pagina.html") ? "index.html" : "";
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const safeUrl = u => /^(https?:\/\/|mailto:|tel:)/i.test(u || "") ? u : "";
  const clean = html => window.DOMPurify
    ? DOMPurify.sanitize(html || "", { ALLOWED_TAGS: ["p","br","h2","h3","h4","strong","em","u","s","ul","ol","li","blockquote","a","hr","img"], ALLOWED_ATTR: ["href","src","alt","target","rel"], ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/)/i })
    : "";
  const safe = async (fn, d) => { try { return await fn(); } catch { return d; } };

  const [general, home, features, notices, categories, schedules, faqs, coaches, albums, media, pages] = await Promise.all([
    safe(() => D.getSetting("general", {}), {}),
    safe(() => D.getSetting("home", {}), {}),
    safe(() => D.getSetting("features", { notices: true }), { notices: true }),
    safe(() => D.list("notices", { where: { status: "published" } }), []),
    safe(() => D.list("categories", { where: { active: true } }), []),
    safe(() => D.list("schedules", { where: { active: true } }), []),
    safe(() => D.list("faqs", { where: { active: true } }), []),
    safe(() => D.list("coaches", { where: { active: true } }), []),
    safe(() => D.list("albums", { where: { active: true } }), []),
    safe(() => D.list("media", { where: { active: true } }), []),
    safe(() => D.list("pages", { where: { status: "published" } }), [])
  ]);

  // ── Navegación y pie: páginas adicionales ──
  const menu = $("#menu");
  if (menu) {
    const cta = $(".btn", menu);
    pages.filter(p => p.show_in_menu).forEach(p => {
      const a = el("a", "", p.title); a.href = `pagina.html?slug=${encodeURIComponent(p.slug)}`;
      menu.insertBefore(a, cta);
    });
  }
  const links = $("#foot-links");
  if (links) pages.filter(p => p.show_in_footer).forEach(p => {
    const a = el("a", "", p.title); a.href = `pagina.html?slug=${encodeURIComponent(p.slug)}`; links.append(a);
  });

  // ── Avisos: enlace en menú y pie solo si la sección está activada y hay avisos publicados ──
  if (features.notices !== false && notices.length) {
    const mk = () => { const a = el("a", "", "Avisos"); a.href = "avisos.html"; return a; };
    if (menu) menu.insertBefore(mk(), $(".btn", menu));
    if (links) links.append(mk());
  }

  // ── Contacto y redes (pie) ──
  const contact = $("#contact");
  if (contact) {
    const parts = [];
    if (general.phone) parts.push(["Tel. " + general.phone, "tel:" + general.phone.replace(/[^\d+]/g, "")]);
    if (general.email) parts.push([general.email, "mailto:" + general.email]);
    if (general.address) parts.push([general.address, ""]);
    parts.forEach(([t, h], i) => {
      if (i) contact.append(" · ");
      if (h) { const a = el("a", "", t); a.href = h; contact.append(a); } else contact.append(t);
    });
  }
  const social = $("#social");
  if (social) [["facebook", "Facebook"], ["instagram", "Instagram"], ["x", "X"], ["youtube", "YouTube"], ["tiktok", "TikTok"]].forEach(([k, label]) => {
    const u = safeUrl((general.social || {})[k]);
    if (!u) return;
    const a = el("a", "", label); a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; social.append(a);
  });

  // Páginas internas: solo menú/pie/contacto
  if (on) return;

  // ── Textos de portada ──
  if (general.hero_lead && $("#hero-lead")) $("#hero-lead").textContent = general.hero_lead;
  if (general.program_text && $("#program-text")) $("#program-text").textContent = general.program_text;
  const txt = (id, v) => { const n = $(id); if (n && v) n.textContent = v; };
  txt("#hero-eyebrow", general.hero_eyebrow);
  txt("#form-text", general.form_text);
  txt("#sched-text", general.sched_text);
  if (Array.isArray(general.program_checks) && general.program_checks.length && $("#checks")) {
    $("#checks").replaceChildren(...general.program_checks.map(t => el("li", "", t)));
  }
  if (Array.isArray(general.stats) && $("#stats")) {
    const items = general.stats.filter(x => x && x.value && x.label);
    $("#stats").replaceChildren(...items.map(x => { const li = el("li"); li.append(el("b", "", x.value), el("span", "", x.label)); return li; }));
    $("#stats").hidden = !items.length;
  }
  if (general.venue && $("#sede")) $("#sede").textContent = "Sede: " + general.venue + (general.address ? " · " + general.address : "");

  // ── Presentación de imágenes del hero ──
  const slides = (home.slides || []).map(s => s.url).filter(Boolean);
  const box = $("#slides");
  if (box && slides.length) {
    const layers = slides.map((u, i) => { const d = el("div", i ? "" : "on"); d.style.backgroundImage = `url("${u.replace(/"/g, "%22")}")`; box.append(d); return d; });
    if (layers.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let i = 0;
      setInterval(() => { layers[i].classList.remove("on"); i = (i + 1) % layers.length; layers[i].classList.add("on"); }, Math.max(3, +home.interval || 6) * 1000);
    }
  }

  // ── Categorías ──
  const cards = $("#cards");
  if (cards && categories.length) {
    cards.replaceChildren(...categories.map((c, i) => {
      const a = el("article", "card" + (c.featured ? " card--gold" : ""));
      a.append(el("span", "card__n", c.featured ? "★" : String(i + 1).padStart(2, "0")), el("h3", "", c.name), el("p", "age", c.age), el("p", "", c.description));
      return a;
    }));
  }

  // ── Horarios ──
  const body = $("#sched-body");
  if (body && schedules.length) {
    body.replaceChildren(...schedules.map(s => { const tr = el("tr"); [s.label, s.days, s.time].forEach(t => tr.append(el("td", "", t))); return tr; }));
  }

  // ── Preguntas frecuentes ──
  const faqBox = $("#faq-list");
  if (faqBox && faqs.length) {
    faqBox.querySelectorAll("details").forEach(d => d.remove());
    faqs.forEach(f => { const d = el("details"); d.append(el("summary", "", f.question), el("p", "", f.answer)); faqBox.append(d); });
  }

  // ── Entrenadores ──
  if (coaches.length) {
    $("#coaches").replaceChildren(...coaches.map(c => {
      const a = el("article", "coach");
      const u = safeUrl(c.photo_url) || (/^data:image\//.test(c.photo_url || "") ? c.photo_url : "");
      if (u) { const i = el("img"); i.src = u; i.alt = c.name; i.loading = "lazy"; a.append(i); } else a.append(el("div", "coach__ph", c.name.charAt(0)));
      const b = el("div", "coach__body"); b.append(el("h3", "", c.name), el("p", "age", c.role), el("p", "", c.bio)); a.append(b);
      return a;
    }));
    $("#entrenadores").hidden = false;
  }

  // ── Galerías (álbumes de fotos y videos) ──
  const KINDS = { entrenamiento: "Entrenamientos", torneo: "Torneos", evento: "Eventos", otro: "Otros" };
  const KIND1 = { entrenamiento: "Entrenamiento", torneo: "Torneo", evento: "Evento", otro: "Galería" };
  const byAlbum = {};
  media.forEach(m => { if (m.kind === "embed" ? D.embedInfo(m.url) : safeUrl(m.url) || /^data:(image|video)\//.test(m.url || "")) (byAlbum[m.album_id] = byAlbum[m.album_id] || []).push(m); });
  Object.values(byAlbum).forEach(l => l.sort((a, b) => a.display_order - b.display_order));
  const shownAlbums = albums.filter(a => byAlbum[a.id]).sort((a, b) => String(b.event_date || b.created_at).localeCompare(String(a.event_date || a.created_at)));
  const day = d => (d ? new Date(d + "T12:00:00").toLocaleDateString("es-MX", { dateStyle: "long" }) : "");
  const thumbOf = a => {
    if (a.cover_url && (safeUrl(a.cover_url) || /^data:image\//.test(a.cover_url))) return a.cover_url;
    const l = byAlbum[a.id], p = l.find(m => m.kind === "photo"); if (p) return p.url;
    const v = l.map(m => m.kind === "embed" && D.embedInfo(m.url)).find(i => i && i.thumb); return v ? v.thumb : "";
  };

  if (shownAlbums.length) {
    const box = $("#albums"), fil = $("#gal-filters"); let kind = "all";
    const viewer = $("#viewer"); let cur = null, idx = 0;
    const drawAlbums = () => {
      box.replaceChildren(...shownAlbums.filter(a => kind === "all" || a.kind === kind).map(a => {
        const c = el("button", "album"); c.type = "button"; c.setAttribute("aria-label", `Abrir galería ${a.title}`);
        const t = thumbOf(a);
        if (t) { const i = el("img"); i.src = t; i.alt = ""; i.loading = "lazy"; c.append(i); } else c.append(el("div", "album__ph", "▶"));
        const n = byAlbum[a.id].length, vids = byAlbum[a.id].filter(m => m.kind !== "photo").length;
        const b = el("div", "album__b");
        b.append(el("span", "album__k", KIND1[a.kind] || "Galería"), el("h3", "", a.title),
          el("p", "", [a.group_name, day(a.event_date)].filter(Boolean).join(" · ") || " "),
          el("small", "", `${n} archivo${n === 1 ? "" : "s"}${vids ? ` · ${vids} video${vids === 1 ? "" : "s"}` : ""}`));
        c.append(b); c.addEventListener("click", () => open(a, 0)); return c;
      }));
    };
    const kinds = [...new Set(shownAlbums.map(a => a.kind))];
    if (kinds.length > 1) {
      fil.replaceChildren(...[["all", "Todas"], ...kinds.map(k => [k, KINDS[k] || k])].map(([k, l]) => {
        const b = el("button", "chip" + (k === "all" ? " on" : ""), l); b.type = "button";
        b.addEventListener("click", () => { kind = k; fil.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === b)); drawAlbums(); }); return b;
      }));
    } else fil.hidden = true;

    const stage = $("#v-media");
    function show() {
      const m = byAlbum[cur.id][idx]; stage.replaceChildren();
      if (m.kind === "photo") { const i = el("img"); i.src = m.url; i.alt = m.caption || cur.title; stage.append(i); }
      else if (m.kind === "video") { const v = el("video"); v.src = m.url; v.controls = true; v.playsInline = true; v.preload = "metadata"; stage.append(v); }
      else { const info = D.embedInfo(m.url); const f = el("iframe"); f.src = info.src; f.title = m.caption || cur.title; f.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true; f.referrerPolicy = "strict-origin-when-cross-origin"; stage.append(f); }
      $("#v-cap").textContent = m.caption || ""; $("#v-count").textContent = `${idx + 1} / ${byAlbum[cur.id].length}`;
      const one = byAlbum[cur.id].length < 2; $("#v-prev").hidden = one; $("#v-next").hidden = one;
    }
    function open(a, i) {
      cur = a; idx = i;
      $("#v-title").textContent = a.title; $("#v-meta").textContent = [KIND1[a.kind], a.group_name, day(a.event_date)].filter(Boolean).join(" · ");
      $("#v-desc").textContent = a.description || ""; $("#v-desc").hidden = !a.description;
      show(); if (!viewer.open) viewer.showModal();
      try { history.replaceState(null, "", "#album=" + a.id); } catch {}
    }
    const step = d => { const n = byAlbum[cur.id].length; idx = (idx + d + n) % n; show(); };
    const close = () => { stage.replaceChildren(); try { history.replaceState(null, "", location.pathname + location.search + "#galeria"); } catch {} };
    $("#v-close").addEventListener("click", () => viewer.close());
    $("#v-prev").addEventListener("click", () => step(-1)); $("#v-next").addEventListener("click", () => step(1));
    viewer.addEventListener("close", close);
    viewer.addEventListener("click", e => { if (e.target === viewer) viewer.close(); });
    viewer.addEventListener("keydown", e => { if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1); });
    drawAlbums(); $("#galeria").hidden = false;
    // Enlace directo a una galería: …/#album=ID
    const m = location.hash.match(/^#album=([0-9a-f-]{36})$/i);
    if (m) { const a = shownAlbums.find(x => x.id === m[1]); if (a) { open(a, 0); } }
    // Acceso en el menú
    const menuEl = $("#menu");
    if (menuEl) { const cta = $(".btn", menuEl), a = el("a", "", "Galería"); a.href = "#galeria"; menuEl.insertBefore(a, cta); }
  }

  // ── Formulario de inscripción ──
  const form = $("#form"), msg = $("#msg");
  if (form) form.addEventListener("submit", async e => {
    e.preventDefault();
    let ok = true;
    form.querySelectorAll("input,select").forEach(f => { const bad = !f.hasAttribute("data-optional") && !f.value.trim(); f.classList.toggle("invalid", bad); if (bad) ok = false; });
    if (!ok) { msg.textContent = "Completa todos los campos."; return; }
    const d = Object.fromEntries(new FormData(form));
    const full = (p) => [d[p + "_nombre"], d[p + "_paterno"], d[p + "_materno"]].map(x => (x || "").trim()).filter(Boolean).join(" ");
    d.jugadora = full("jugadora"); d.tutor = full("tutor");
    const btn = form.querySelector("button"); btn.disabled = true; msg.textContent = "Enviando…";
    try {
      const t = k => (d[k] || "").trim();
      await D.submitEnrollment({
        player_name: d.jugadora, player_first: t("jugadora_nombre"), player_paternal: t("jugadora_paterno"), player_maternal: t("jugadora_materno"),
        guardian: d.tutor, guardian_first: t("tutor_nombre"), guardian_paternal: t("tutor_paterno"), guardian_maternal: t("tutor_materno"),
        age: +d.edad, category: d.categoria, phone: d.tel.trim() });
      const wa = (general.whatsapp || "").replace(/\D/g, "");
      if (wa) {
        const text = `Hola, quiero una clase de prueba en la Academia Elite.\nJugadora: ${d.jugadora}\nEdad: ${d.edad}\nCategoría: ${d.categoria}\nTutor: ${d.tutor}\nWhatsApp: ${d.tel}`;
        window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }
      msg.textContent = "¡Gracias! Recibimos tu solicitud y te contactaremos pronto.";
      form.reset();
    } catch (err) { msg.textContent = err.message; }
    btn.disabled = false;
  });

  // Categorías en el selector del formulario
  const sel = $("select[name=categoria]");
  if (sel && categories.length) {
    sel.replaceChildren(new Option("Elegir…", ""), ...categories.filter(c => !c.featured).map(c => new Option(c.name, c.name)), new Option("No sé aún", "No sé aún"));
  }
})();
