/**
 * VersePaint draw-boot — start screen workspace choice (draw vs motion)
 */
(function () {
  function $(id) { return document.getElementById(id); }

  function setWorkspace(ws) {
    document.querySelectorAll('.start-workspace').forEach(function (b) {
      var on = b.dataset.ws === ws;
      b.classList.toggle('active', on);
      if (on) {
        b.style.borderColor = 'rgba(255,255,255,0.45)';
        b.style.background = 'rgba(255,255,255,0.08)';
      } else {
        b.style.borderColor = '';
        b.style.background = '';
      }
    });
    var drawOpts = $('start-draw-options');
    var motionOpts = $('start-motion-options');
    if (drawOpts) {
      drawOpts.classList.toggle('hidden', ws !== 'draw');
      drawOpts.style.display = ws === 'draw' ? 'flex' : 'none';
    }
    if (motionOpts) {
      motionOpts.classList.toggle('hidden', ws !== 'motion');
      motionOpts.style.display = ws === 'motion' ? 'flex' : 'none';
    }
  }

  function boot() {
    var animBtn = $('mode-anim-btn');
    if (animBtn) animBtn.remove();
    var animBar = $('anim-bar');
    if (animBar) {
      animBar.style.display = 'none';
      animBar.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('.start-workspace').forEach(function (b) {
      b.addEventListener('click', function () {
        setWorkspace(b.dataset.ws || 'draw');
      });
    });
    setWorkspace('draw');

    var motionBtn = $('btn-start-motion');
    if (motionBtn) {
      motionBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var w = ($('motion-w') && $('motion-w').value) || 1920;
        var h = ($('motion-h') && $('motion-h').value) || 1080;
        var fps = ($('motion-fps') && $('motion-fps').value) || 24;
        var q = new URLSearchParams({ w: String(w), h: String(h), fps: String(fps) });
        location.href = './motion.html?' + q.toString();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
