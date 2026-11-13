// Temporary restore: load the last known-working main.js from commit b75c9d3
// (local main.js was corrupted by a failed large-file upload)
(function () {
  var urls = [
    'https://cdn.jsdelivr.net/gh/SuchGameR/paint@b75c9d3f0edba50ede086bf80eb23ef35a83199e/js/main.js',
    'https://fastly.jsdelivr.net/gh/SuchGameR/paint@b75c9d3f0edba50ede086bf80eb23ef35a83199e/js/main.js'
  ];
  var i = 0;
  function load() {
    if (i >= urls.length) {
      document.body.insertAdjacentHTML(
        'afterbegin',
        '<div style="position:fixed;inset:0;z-index:99999;background:#111;color:#f88;padding:24px;font:14px system-ui">' +
          '<h1>VersePaint の読み込みに失敗しました</h1>' +
          '<p>ネットワークを確認して再読み込みしてください。</p></div>'
      );
      return;
    }
    var s = document.createElement('script');
    s.src = urls[i++];
    s.onerror = load;
    document.head.appendChild(s);
  }
  load();
})();
