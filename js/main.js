// VersePaint main — loads split chunks then runs
(function () {
  var parts = window.__VP_CHUNKS || [];
  if (parts.length < 5) {
    console.error('VersePaint: expected 5 chunks, got ' + parts.length);
    return;
  }
  var code = parts.join('');
  // clear to free memory
  window.__VP_CHUNKS = null;
  var s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
})();
