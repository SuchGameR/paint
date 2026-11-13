/**
 * VersePaint draw-boot — start screen workspace choice (draw vs motion)
 * Runs after modules; patches start UI without needing full main.js rewrite.
 */
(function () {
  function $(id) { return document.getElementById(id); }

  function setWorkspace(ws) {
    document.querySelectorAll('.start-workspace').forEach(function (b) {
      b.classList.toggle('active', b.dataset.ws === ws);
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

  document.addEventListener('DOMContentLoaded', function () {
    var animBtn = $('mode-anim-btn');
    if (animBtn) animBtn.remove();
    var animBar = $('anim-bar');
    if (animBar) animBar.remove();

    document.querySelectorAll('.start-workspace').forEach(function (b) {
      b.addEventListener('click', function () {
        setWorkspace(b.dataset.ws || 'draw');
      });
    });
    setWorkspace('draw');

    var motionBtn = $('btn-start-motion');
    if (motionBtn) {
      motionBtn.addEventListener('click', function () {
        var w = ($('motion-w') && $('motion-w').value) || 1920;
        var h = ($('motion-h') && $('motion-h').value) || 1080;
        var fps = ($('motion-fps') && $('motion-fps').value) || 24;
        var q = new URLSearchParams({ w: w, h: h, fps: fps });
        location.href = './motion.html?' + q.toString();
      });
    }
  });
})();
