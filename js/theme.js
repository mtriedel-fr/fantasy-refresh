// One theme choice for the whole site.
// Loaded in <head> on every page, before anything is drawn, so a page never
// flashes the wrong theme. The member's own choice (saved as fr_theme by any
// page's ☀️/🌙 toggle) wins; with no saved choice, follow the phone's
// light/dark setting. Colors for both themes live in /css/theme.css.
(function () {
  function pick() {
    try {
      var saved = localStorage.getItem('fr_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) {}
    return 'dark';
  }
  document.documentElement.setAttribute('data-theme', pick());
  // No saved choice yet: keep following the phone if it switches (e.g. at sunset).
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
      var saved = null; try { saved = localStorage.getItem('fr_theme'); } catch (e) {}
      if (!saved) document.documentElement.setAttribute('data-theme', pick());
    });
  } catch (e) {}
})();
