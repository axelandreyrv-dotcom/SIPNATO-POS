// Corre antes de React para evitar el destello claro. Sin preferencia guardada, sigue al sistema.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem('dosuxsoft-theme');
  } catch {
    // Sin almacenamiento (modo privado estricto): se sigue al sistema.
  }
  var dark =
    stored === 'dark' ||
    (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) {
    document.documentElement.classList.add('dark');
  }
})();
