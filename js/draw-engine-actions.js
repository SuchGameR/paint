/** Expand menu actions at runtime (loaded after bridge). Non-destructive. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function click(el) { if (el) { el.click(); return true; } return false; }
  function getState() { return window.__VP_STATE || null; }
  function redraw() {
    if (typeof window.__VP_RENDER === 'function') try { window.__VP_RENDER(); } catch (e) {}
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.source !== 'verse-new-ui' || data.type !== 'menu') return;
    var action = data.action;
    if (!action) return;

    function clickId(id) { return click($(id)); }
    function clickSel(sel) { return click(document.querySelector(sel)); }
    function key(k, mods) {
      document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, mods || {})));
    }

    var idMap = {
      undo: 'btn-undo', redo: 'btn-redo', clear: 'btn-clear',
      open: 'btn-load-project', insert: 'btn-insert-image', grid: 'btn-grid-toggle',
      'flip-h': 'btn-flip-h', 'flip-v': 'btn-flip-v',
      group: 'btn-group', ungroup: 'btn-ungroup',
      mask: 'btn-use-mask', 'clear-mask': 'btn-clear-mask',
      delete: 'btn-delete-selected', 'add-layer': 'btn-add-layer',
      settings: 'btn-settings', 'region-save': 'btn-region-save',
      'panel-brush': 'btn-brush-panel-toggle', 'panel-props': 'btn-props-toggle',
      'mode-vector': 'mode-vector-btn', 'mode-paint': 'mode-paint-btn'
    };
    if (action === 'export') {
      if (!clickSel('[data-export="png"]')) console.error('PNG export is unavailable in the drawing engine.');
      return;
    }
    if (action === 'export-svg') {
      if (!clickSel('[data-export="svg"]')) console.error('SVG export is unavailable in the drawing engine.');
      return;
    }
    if (action === 'save-project') {
      if (!clickSel('[data-export="project"]')) console.error('Project export is unavailable in the drawing engine.');
      return;
    }
    if (action === 'export-region') {
      var exportModal = $('export-region-modal');
      if (!exportModal || !$('btn-export-region-menu')) {
        console.error('Region export is unavailable in the drawing engine.');
        return;
      }
      exportModal.style.display = '';
      clickId('btn-export-region-menu');
      return;
    }
    if (idMap[action] && clickId(idMap[action])) return;

    if (action === 'new') {
      if (confirm('新規キャンバスにしますか？')) clickId('btn-clear');
      return;
    }
    if (action === 'select-all') { key('a', { ctrlKey: true }); return; }
    if (action === 'deselect') {
      var st = getState();
      if (st) { st.selectedIds = new Set(); redraw(); }
      return;
    }
    if (action === 'cut') { key('x', { ctrlKey: true }); return; }
    if (action === 'copy') { key('c', { ctrlKey: true }); return; }
    if (action === 'paste') { key('v', { ctrlKey: true }); return; }
    if (action === 'duplicate') { clickSel('[data-ctx="duplicate"]'); return; }
    if (action === 'bring-front') { clickSel('[data-ctx="bring-front"]'); return; }
    if (action === 'bring-forward') { clickSel('[data-ctx="bring-forward"]'); return; }
    if (action === 'send-backward') { clickSel('[data-ctx="send-backward"]'); return; }
    if (action === 'send-back') { clickSel('[data-ctx="send-back"]'); return; }
    if (action === 'to-raster') { clickSel('[data-ctx="to-raster"]'); return; }
    if (action === 'to-vector') { clickSel('[data-ctx="to-vector"]'); return; }
    if (action === 'effect-more') {
      clickSel('[data-ctx="effect-more"]');
      var sheet = $('effect-more-sheet');
      if (sheet) {
        sheet.classList.remove('hidden');
        sheet.style.display = '';
        sheet.style.pointerEvents = 'auto';
        sheet.style.zIndex = '9999';
      }
      return;
    }
    if (action === 'pixel-grid') {
      var tg = $('pixel-grid-toggle');
      if (tg) { tg.checked = !tg.checked; tg.dispatchEvent(new Event('change', { bubbles: true })); }
      else {
        var s = getState();
        if (s) { s.pixelGrid = !s.pixelGrid; redraw(); }
      }
      return;
    }
    if (action === 'pressure-on') {
      var st2 = getState();
      if (st2) st2.pressureEnabled = true;
      ['pressure-toggle', 'pressure-toggle-left'].forEach(function (id) {
        var el = $(id);
        if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      return;
    }
    if (action === 'panel-layers') {
      clickId('tab-layers');
      clickId('btn-props-toggle');
      return;
    }
    if (action === 'export-png-session') {
      try {
        var c = document.querySelector('#canvas-container canvas') || document.querySelector('canvas');
        if (c) sessionStorage.setItem('vp-import-png', c.toDataURL('image/png'));
      } catch (e) {}
    }
  });
})();
