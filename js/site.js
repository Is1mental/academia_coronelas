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

  const [general, home, categories, schedules, faqs, coaches, photos, pages] = await Promise.all([
    safe(() => D.getSetting("general", {}), {}),
    safe(() => D.getSetting("home", {}), {}),
    safe(() => D.list("categories", { where: { active: true } }), []),
    safe(() => D.list("schedules", { where: { active: true } }), []),
    safe(() => D.list("faqs", { where: { active: true } }), []),
    safe(() => D.list("coaches", { where: { active: true } }), []),
    safe(() => D.list("photos", { where: { active: true } }), []),
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

  // ── Galería ──
  if (photos.length) {
    $("#gallery").replaceChildren(...photos.map(p => {
      const f = el("figure"); const i = el("img"); i.src = p.url; i.alt = p.caption || "Fotografía de la academia"; i.loading = "lazy"; f.append(i);
      if (p.caption) f.append(el("figcaption", "", p.caption));
      return f;
    }));
    $("#galeria").hidden = false;
  }

  // ── Formulario de inscripción ──
  const form = $("#form"), msg = $("#msg");
  form.addEventListener("submit", async e => {
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
