(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  $("#y").textContent = new Date().getFullYear();

  // tema claro / oscuro: por defecto el del dispositivo; el botón guarda la elección en este navegador
  const root = document.documentElement, themeBtn = $("#theme"), mq = matchMedia("(prefers-color-scheme: light)");
  const ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };
  const current = () => root.dataset.theme || (mq.matches ? "light" : "dark");
  const paint = () => {
    const t = current(), meta = $('meta[name="theme-color"]');
    if (meta) meta.content = t === "light" ? "#f7f5f0" : "#0d0e12";
    if (themeBtn) {
      themeBtn.innerHTML = t === "light" ? ICON.moon : ICON.sun;
      themeBtn.setAttribute("aria-label", t === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro");
      themeBtn.title = themeBtn.getAttribute("aria-label");
    }
  };
  if (themeBtn) themeBtn.addEventListener("click", () => {
    const next = current() === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try { localStorage.setItem("academia:theme", next); } catch {}
    paint();
  });
  mq.addEventListener && mq.addEventListener("change", paint);
  paint();

  // menú móvil
  const burger = $("#burger"), menu = $("#menu");
  const setMenu = open => {
    menu.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", open);
  };
  burger.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
  $$("a", menu).forEach(a => a.addEventListener("click", () => setMenu(false)));

  // aparición al hacer scroll
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: .15 });
  $$(".reveal").forEach(el => io.observe(el));

  // contadores
  $$("[data-count]").forEach(el => {
    const end = +el.dataset.count;
    let n = 0;
    const t = setInterval(() => {
      el.textContent = ++n;
      if (n >= end) clearInterval(t);
    }, 700 / end);
  });

})();
