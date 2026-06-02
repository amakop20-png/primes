// help.js — handles theme toggle, menu, loader, and collapsible help sections
document.addEventListener('DOMContentLoaded', function () {
  const loader = document.getElementById('loaderWrapper');
  if (loader) loader.style.display = 'none';

  function updateLandingThemeUI(isDark) {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    const icon = themeToggle.querySelector('i');
    if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

  const savedTheme = localStorage.getItem('dashboardTheme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  updateLandingThemeUI(document.body.classList.contains('dark-theme'));

  const menuToggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('nav');
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function () {
      menuToggle.classList.toggle('open');
      nav.classList.toggle('open');
    });

    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', function () {
        menuToggle.classList.remove('open');
        nav.classList.remove('open');
      });
    });
  }

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      document.body.classList.toggle('dark-theme');
      const isDark = document.body.classList.contains('dark-theme');
      localStorage.setItem('dashboardTheme', isDark ? 'dark' : 'light');
      updateLandingThemeUI(isDark);
    });
  }

  // Collapsible help sections: clicking the heading toggles section body
  document.querySelectorAll('.help-section h2').forEach(function (h) {
    h.style.cursor = 'pointer';
    const section = h.parentElement;
    const bodyEls = Array.prototype.filter.call(section.children, function (c) { return c !== h; });
    h.addEventListener('click', function () {
      bodyEls.forEach(function (el) {
        el.style.display = (el.style.display === 'none') ? '' : 'none';
      });
    });
  });
});
