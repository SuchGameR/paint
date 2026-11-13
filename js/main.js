// Restore: fetch last known-working main.js and run it
// (handles the case where DOMContentLoaded already fired)
(function () {
  var urls = [
    'https://cdn.jsdelivr.net/gh/SuchGameR/paint@b75c9d3f0edba50ede086bf80eb23ef35a83199e/js/main.js',
    'https://fastly.jsdelivr.net/gh/SuchGameR/paint@b75c9d3f0edba50ede086bf80eb23ef35a83199e/js/main.js',
    'https://raw.githubusercontent.com/SuchGameR/paint/b75c9d3f0edba50ede086bf80eb23ef35a83199e/js/main.js'
  ];

  function showError(err) {
    console.error('VersePaint load failed', err);
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div style="position:fixed;inset:0;z-index:99999;background:#111;color:#f88;padding:24px;font:14px system-ui">' +
        '<h1>VersePaint の読み込みに失敗しました</h1>' +
        '<p>ネットワークを確認して再読み込みしてください。</p>' +
        '<pre style="white-space:pre-wrap;font-size:12px;opacity:.8">' + String(err) + '</pre></div>'
    );
  }

  function runCode(code) {
    // Strip BOM if present
    if (code.charCodeAt(0) === 0xfeff) code = code.slice(1);
    var s = document.createElement('script');
    s.textContent = code;
    document.head.appendChild(s);
    // Original main.js waits for DOMContentLoaded; re-dispatch if already ready
    if (document.readyState !== 'loading') {
      document.dispatchEvent(new Event('DOMContentLoaded'));
    }
  }

  function tryFetch(i) {
    if (i >= urls.length) {
      showError(new Error('all sources failed'));
      return;
    }
    fetch(urls[i], { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error(urls[i] + ' -> ' + r.status);
        return r.text();
      })
      .then(runCode)
      .catch(function (err) {
        console.warn('VersePaint source failed', urls[i], err);
        tryFetch(i + 1);
      });
  }

  tryFetch(0);
})();
