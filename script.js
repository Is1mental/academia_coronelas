(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  $("#y").textContent = new Date().getFullYear();

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
