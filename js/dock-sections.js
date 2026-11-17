(function () {
  "use strict";

  var STORAGE_KEY = "verse.section-dock.v3";
  var SECTION_IDS = [
    "layers-section",
    "tool-preview-section",
    "color-palette-section",
    "tool-context-section",
    "swatch-palette-section"
  ];
  var SLOT_IDS = ["header", "properties", "tools", "footer"];

  var style = document.createElement("style");
  style.textContent = [
    ".vp-section-host{position:relative!important;}",
    ".vp-section-grip{position:absolute;top:5px;right:5px;z-index:12;display:grid;grid-template-columns:repeat(2,2px);grid-template-rows:repeat(3,2px);gap:2px;width:17px;height:23px;place-content:center;padding:0;border:1px solid #374138;border-radius:6px;background:#121613cc;cursor:grab;touch-action:none;opacity:.75;}",
    ".vp-section-grip span{width:2px;height:2px;border-radius:50%;background:#93a096;}",
    ".vp-section-grip:hover,.vp-section-grip:focus-visible{opacity:1;border-color:#4d6253;outline:none;}",
    ".vp-section-grip:active{cursor:grabbing;}",
    "#tool-preview-section>.vp-section-grip{right:33px;}",
    "#color-palette-section>.vp-section-grip{top:36px;}",
    ".vp-section-floating{position:fixed!important;z-index:70!important;width:280px!important;min-width:220px!important;max-height:calc(100vh - 24px)!important;margin:0!important;overflow:auto!important;resize:both;border:1px solid #35443b!important;border-radius:12px!important;background:#121713!important;box-shadow:0 16px 40px #000a!important;padding:12px!important;}",
    ".vp-section-floating.is-dragging{pointer-events:none!important;contain:layout paint;box-shadow:0 8px 18px #0008!important;}",
    ".vp-section-docked-slot{position:relative!important;flex:0 0 auto!important;margin:0!important;border:1px solid #2f3d34!important;border-radius:10px!important;background:#121713!important;padding:10px!important;overflow:auto!important;max-height:100%;}",
    "header.vp-drop-host,footer#app-footer.vp-drop-host{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}",
    "header.vp-drop-host>.vp-section-docked-slot,footer#app-footer.vp-drop-host>.vp-section-docked-slot{max-width:min(360px,46vw);max-height:46vh;}",
    "#tools.vp-drop-host{display:flex;flex-direction:column;gap:8px;}",
    "#tools.vp-drop-host>.vp-section-docked-slot{width:100%;max-height:40vh;}",
    "#properties.vp-drop-host.is-drop-target,#tools.vp-drop-host.is-drop-target,header.vp-drop-host.is-drop-target,footer#app-footer.vp-drop-host.is-drop-target{outline:2px dashed #22c55e88;outline-offset:-2px;background-image:linear-gradient(#22c55e14,#22c55e14);}",
    ".vp-section-placeholder{height:10px;margin:4px 0;border:1px dashed #2c3b30;border-radius:6px;background:#22c55e10;}",
    ".vp-section-placeholder.is-target{border-color:#22c55e;background:#22c55e28;}",
    "#app-footer{display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 10px;border-top:1px solid #222822;background:#0b0b0b;color:#a7aaa8;font-size:12px;}",
    "#app-footer .app-footer-label{opacity:.55;margin-right:4px;white-space:nowrap;}",
    "body.vp-section-dragging{user-select:none!important;cursor:grabbing!important;}",
    "body.vp-section-dragging iframe{pointer-events:none!important;}",
    "details.nav-nested[open]>summary{background:#292929;color:var(--accent-color,#22c55e);}"
  ].join("");
  document.head.appendChild(style);

  function init() {
    if (document.documentElement.dataset.vpSectionDock === "1") return;
    document.documentElement.dataset.vpSectionDock = "1";

    var properties = document.getElementById("properties");
    if (!properties) {
      setTimeout(init, 120);
      return;
    }

    var header = document.querySelector("header");
    var tools = document.getElementById("tools");
    var footer = ensureFooter();
    var slots = {
      header: header,
      properties: properties,
      tools: tools,
      footer: footer
    };

    SLOT_IDS.forEach(function (id) {
      var el = slots[id];
      if (el) el.classList.add("vp-drop-host");
    });

    var records = [];
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (error) { saved = {}; }

    function ensureFooter() {
      var existing = document.getElementById("app-footer");
      if (existing) return existing;
      var el = document.createElement("footer");
      el.id = "app-footer";
      el.setAttribute("aria-label", "フッター");
      var label = document.createElement("span");
      label.className = "app-footer-label";
      label.textContent = "フッター";
      el.appendChild(label);
      document.body.appendChild(el);
      return el;
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }

    function clampPoint(left, top, width, height) {
      var margin = 6;
      var maxLeft = Math.max(margin, window.innerWidth - width - margin);
      var maxTop = Math.max(margin, window.innerHeight - height - margin);
      return {
        left: clamp(left, margin, maxLeft),
        top: clamp(top, margin, maxTop)
      };
    }

    function clearFloatingStyle(el) {
      ["position", "left", "top", "right", "bottom", "width", "height", "max-height", "margin", "z-index", "resize", "transform", "will-change"].forEach(function (property) {
        el.style.removeProperty(property);
      });
    }

    function saveLayout() {
      var data = {};
      records.forEach(function (rec) {
        var rect = rec.el.getBoundingClientRect();
        data[rec.id] = {
          mode: rec.mode,
          slot: rec.slot || null,
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: rec.mode === "float" ? Math.round(rect.height) : 0
        };
      });
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (error) {}
    }

    function ensurePlaceholder(rec) {
      if (rec.placeholder && rec.placeholder.isConnected) return rec.placeholder;
      var placeholder = document.createElement("div");
      placeholder.className = "vp-section-placeholder";
      placeholder.dataset.sectionPlaceholder = rec.id;
      var parent = rec.homeParent && rec.homeParent.isConnected ? rec.homeParent : properties;
      parent.insertBefore(placeholder, rec.el.parentElement === parent ? rec.el : null);
      rec.placeholder = placeholder;
      return placeholder;
    }

    function clearDropHighlights() {
      SLOT_IDS.forEach(function (id) {
        if (slots[id]) slots[id].classList.remove("is-drop-target");
      });
      records.forEach(function (item) {
        if (item.placeholder) item.placeholder.classList.remove("is-target");
      });
    }

    function findDropSlot(x, y, geometry) {
      if (!geometry) return null;
      for (var i = 0; i < SLOT_IDS.length; i++) {
        var id = SLOT_IDS[i];
        var rect = geometry[id];
        if (!rect) continue;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return id;
        }
      }
      return null;
    }

    function measureSlots() {
      var out = {};
      SLOT_IDS.forEach(function (id) {
        var el = slots[id];
        if (!el) return;
        out[id] = el.getBoundingClientRect();
      });
      return out;
    }

    function dockToSlot(rec, slotId, animate) {
      var host = slots[slotId];
      if (!host) return;
      ensurePlaceholder(rec);
      rec.el.classList.remove("vp-section-floating", "vp-section-docked-slot");
      clearFloatingStyle(rec.el);
      if (slotId === "properties") {
        var placeholder = rec.placeholder;
        var parent = placeholder && placeholder.parentElement
          ? placeholder.parentElement
          : (rec.homeParent || properties);
        parent.insertBefore(rec.el, placeholder || null);
        if (placeholder) {
          placeholder.remove();
          rec.placeholder = null;
        }
        rec.mode = "home";
        rec.slot = "properties";
      } else {
        rec.el.classList.add("vp-section-docked-slot");
        host.appendChild(rec.el);
        rec.mode = "slot";
        rec.slot = slotId;
      }
      if (animate !== false) {
        // keep lightweight — no FLIP animation during layout thrash
      }
      setGripTitle(rec);
      saveLayout();
    }

    function floatSection(rec, left, top, width, height) {
      var rect = rec.el.getBoundingClientRect();
      ensurePlaceholder(rec);
      rec.el.classList.remove("vp-section-docked-slot");
      rec.el.classList.add("vp-section-floating");
      document.body.appendChild(rec.el);
      rec.mode = "float";
      rec.slot = null;
      var w = Math.max(220, Math.round(width || rect.width));
      var h = Math.round(height || rect.height);
      var pos = clampPoint(left == null ? rect.left : left, top == null ? rect.top : top, w, h || 120);
      rec.el.style.left = pos.left + "px";
      rec.el.style.top = pos.top + "px";
      rec.el.style.width = w + "px";
      if (height) rec.el.style.height = h + "px";
      rec.el.style.transform = "none";
      setGripTitle(rec);
      saveLayout();
    }

    function setGripTitle(rec) {
      if (!rec.grip) return;
      rec.grip.title = "ドラッグして移動 · ヘッダー / プロパティ / ツール / フッターへ配置 · ダブルクリックでプロパティに戻す";
      rec.grip.setAttribute("aria-label", "セクションを移動");
    }

    function wireGrip(rec) {
      var grip = document.createElement("button");
      grip.type = "button";
      grip.className = "vp-section-grip";
      grip.innerHTML = "<span></span><span></span><span></span><span></span><span></span><span></span>";
      rec.el.appendChild(grip);
      rec.grip = grip;
      setGripTitle(rec);

      grip.addEventListener("dblclick", function (event) {
        event.preventDefault();
        event.stopPropagation();
        dockToSlot(rec, "properties");
      });

      grip.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        var startX = event.clientX;
        var startY = event.clientY;
        var startRect = rec.el.getBoundingClientRect();
        var startLeft = startRect.left;
        var startTop = startRect.top;
        var dragWidth = startRect.width;
        var dragHeight = startRect.height;
        var started = false;
        var frame = null;
        var lastX = startX;
        var lastY = startY;
        var tx = 0;
        var ty = 0;
        var dropSlot = null;
        var geometry = null;

        function startDrag() {
          if (started) return;
          started = true;
          document.body.classList.add("vp-section-dragging");
          if (rec.mode !== "float") {
            floatSection(rec, startLeft, startTop, dragWidth, dragHeight);
          }
          rec.el.classList.add("is-dragging");
          geometry = measureSlots();
        }

        function applyMove() {
          frame = null;
          if (!started) return;
          var pos = clampPoint(startLeft + (lastX - startX), startTop + (lastY - startY), dragWidth, dragHeight);
          tx = pos.left - startLeft;
          ty = pos.top - startTop;
          rec.el.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
          var next = findDropSlot(lastX, lastY, geometry);
          if (next !== dropSlot) {
            dropSlot = next;
            clearDropHighlights();
            if (dropSlot && slots[dropSlot]) slots[dropSlot].classList.add("is-drop-target");
            if (dropSlot === "properties" && rec.placeholder) {
              rec.placeholder.classList.add("is-target");
            }
          }
        }

        function onMove(moveEvent) {
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
          if (!started && Math.hypot(lastX - startX, lastY - startY) < 4) return;
          startDrag();
          if (!frame) frame = requestAnimationFrame(applyMove);
        }

        function cleanup() {
          grip.removeEventListener("pointermove", onMove);
          grip.removeEventListener("pointerup", finish);
          grip.removeEventListener("pointercancel", cancel);
          if (frame) cancelAnimationFrame(frame);
          frame = null;
          if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
          document.body.classList.remove("vp-section-dragging");
          rec.el.classList.remove("is-dragging");
          clearDropHighlights();
        }

        function finish(finishEvent) {
          if (started && finishEvent) {
            lastX = finishEvent.clientX;
            lastY = finishEvent.clientY;
            if (frame) {
              cancelAnimationFrame(frame);
              frame = null;
            }
            applyMove();
            // refresh geometry once at end for accurate drop
            geometry = measureSlots();
            dropSlot = findDropSlot(lastX, lastY, geometry);
          }
          cleanup();
          if (!started) return;

          if (dropSlot) {
            dockToSlot(rec, dropSlot);
          } else {
            var pos = clampPoint(startLeft + tx, startTop + ty, dragWidth, dragHeight);
            rec.el.style.left = pos.left + "px";
            rec.el.style.top = pos.top + "px";
            rec.el.style.transform = "none";
            saveLayout();
          }
          setGripTitle(rec);
        }

        function cancel() {
          cleanup();
          if (started) dockToSlot(rec, "properties");
          setGripTitle(rec);
        }

        grip.setPointerCapture(event.pointerId);
        grip.addEventListener("pointermove", onMove);
        grip.addEventListener("pointerup", finish);
        grip.addEventListener("pointercancel", cancel);
      });
    }

    function collectSections() {
      SECTION_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el.dataset.sectionDockReady === "1") return;
        el.dataset.sectionDockReady = "1";
        el.classList.add("vp-section-host");
        var rec = {
          id: id,
          el: el,
          homeParent: el.parentElement,
          placeholder: null,
          grip: null,
          mode: "home",
          slot: "properties"
        };
        records.push(rec);
        wireGrip(rec);
      });
      return records.length;
    }

    collectSections();
    if (!records.length) return;

    records.forEach(function (rec) {
      var state = saved[rec.id];
      if (!state) return;
      if (state.mode === "float") {
        floatSection(rec, state.left, state.top, state.width, state.height);
      } else if (state.mode === "slot" && state.slot && state.slot !== "properties" && slots[state.slot]) {
        dockToSlot(rec, state.slot, false);
      } else if (state.mode === "home" || state.slot === "properties") {
        // already home
      } else if (typeof state.mode === "string" && state.mode.indexOf("dock-") === 0) {
        // migrate old canvas-dock layouts to free float
        floatSection(rec, state.left, state.top, state.width || 280, state.height || 0);
      }
    });

    var resetButton = document.getElementById("panel-layout-reset");
    if (resetButton) {
      resetButton.addEventListener("click", function () {
        records.forEach(function (rec) {
          dockToSlot(rec, "properties", false);
        });
        try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}
      });
    }

    window.addEventListener("resize", function () {
      records.forEach(function (rec) {
        if (rec.mode !== "float") return;
        var rect = rec.el.getBoundingClientRect();
        var pos = clampPoint(rect.left, rect.top, rect.width, rect.height);
        rec.el.style.left = pos.left + "px";
        rec.el.style.top = pos.top + "px";
      });
    });

    [120, 360, 900].forEach(function (delay) {
      setTimeout(function () {
        collectSections();
      }, delay);
    });
  }

  function enableNestedMenuHover() {
    if (document.documentElement.dataset.nestedHoverReady === "1") return;
    document.documentElement.dataset.nestedHoverReady = "1";
    var openTimers = new WeakMap();
    var closeTimers = new WeakMap();

    function nestedOf(target) {
      return target instanceof Element ? target.closest("details.nav-nested") : null;
    }

    function topOf(target) {
      return target instanceof Element ? target.closest("details.navigation-submenu") : null;
    }

    function cancelOpen(el) {
      var timer = openTimers.get(el);
      if (timer) { clearTimeout(timer); openTimers.delete(el); }
    }

    function cancelClose(el) {
      var timer = closeTimers.get(el);
      if (timer) { clearTimeout(timer); closeTimers.delete(el); }
    }

    function scheduleOpen(el, isTop) {
      cancelOpen(el);
      cancelClose(el);
      openTimers.set(el, setTimeout(function () {
        openTimers.delete(el);
        if (!el.isConnected) return;
        if (isTop) {
          var menu = document.querySelector("details.main-navigation, #main-navigation");
          if (menu && !menu.open) return;
          document.querySelectorAll("details.navigation-submenu[open]").forEach(function (other) {
            if (other !== el) other.open = false;
          });
        } else {
          var scope = el.closest("details.navigation-submenu") || document;
          scope.querySelectorAll("details.nav-nested[open]").forEach(function (other) {
            if (other !== el && !el.contains(other) && !other.contains(el)) other.open = false;
          });
        }
        el.open = true;
      }, isTop ? 60 : 65));
    }

    function scheduleClose(el) {
      cancelOpen(el);
      cancelClose(el);
      closeTimers.set(el, setTimeout(function () {
        closeTimers.delete(el);
        if (el.isConnected) el.open = false;
      }, 160));
    }

    document.addEventListener("pointerover", function (event) {
      if (event.pointerType === "touch") return;
      var nested = nestedOf(event.target);
      var top = topOf(event.target);
      if (!nested && !top) return;
      if (nested) {
        cancelClose(nested);
        if (event.relatedTarget instanceof Node && nested.contains(event.relatedTarget)) return;
        scheduleOpen(nested, false);
        return;
      }
      cancelClose(top);
      if (event.relatedTarget instanceof Node && top.contains(event.relatedTarget)) return;
      scheduleOpen(top, true);
    });

    document.addEventListener("pointerout", function (event) {
      if (event.pointerType === "touch") return;
      var nested = nestedOf(event.target);
      var top = topOf(event.target);
      if (nested) {
        if (event.relatedTarget instanceof Node && nested.contains(event.relatedTarget)) return;
        scheduleClose(nested);
        return;
      }
      if (top && !(event.relatedTarget instanceof Node && top.contains(event.relatedTarget))) {
        scheduleClose(top);
      }
    });

    function closeAll() {
      document.querySelectorAll("details.navigation-submenu[open], details.nav-nested[open]").forEach(function (el) {
        cancelOpen(el);
        scheduleClose(el);
      });
    }

    function bindLeave() {
      var nav = document.querySelector("details.main-navigation, #main-navigation");
      if (!nav) return setTimeout(bindLeave, 120);
      if (nav.dataset.nestedLeaveReady === "1") return;
      nav.dataset.nestedLeaveReady = "1";
      nav.addEventListener("pointerleave", function (event) {
        if (event.pointerType === "touch") return;
        closeAll();
      });
    }

    bindLeave();
  }

  function boot() {
    init();
    enableNestedMenuHover();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 80); });
  } else {
    setTimeout(boot, 80);
  }
})();
