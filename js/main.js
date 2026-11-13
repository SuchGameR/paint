// VersePaint main loader — restores app from gzipped split parts
(function () {
  var parts = window.__VP_B64 || [];
  if (!parts.length) {
    console.error('VersePaint: missing bundle parts');
    return;
  }
  var b64 = parts.join('');
  window.__VP_B64 = null;
  try {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')))
      .arrayBuffer()
      .then(function (buf) {
        var code = new TextDecoder('utf-8').decode(buf);
        var s = document.createElement('script');
        s.textContent = code;
        document.head.appendChild(s);
      })
      .catch(function (err) {
        console.error('VersePaint load failed', err);
        document.body.insertAdjacentHTML('afterbegin',
          '<div style="position:fixed;inset:0;z-index:99999;background:#111;color:#f88;padding:24px;font:14px system-ui">' +
          '<h1>読み込みエラー</h1><pre>' + String(err) + '</pre></div>');
      });
  } catch (err) {
    console.error(err);
  }
})();
