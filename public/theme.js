// Runs before first paint (external file because the CSP blocks inline scripts).
(function () {
  var t = null;
  try { t = localStorage.getItem('bw-theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
})();
