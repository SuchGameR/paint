(function () {
  "use strict";

  var STORAGE_KEY = "verse.section-dock.v1";
  var SECTION_IDS = [
    "tool-preview-section",
    "color-palette-section",
    "tool-context-section",
    "swatch-palette-section"
  ];

  var style = document.createElement("style");
  style.textContent = [
    ".vp-section-host{position:relative!important;}",
    ".vp-section-grip{position:absolute;top:5px;right:5px;z-index:12;display:grid;grid-template-columns:repeat(2,2px);grid-template-rows:repeat(3,2px);gap:2px;width:17px;height:23px;place-content:center;padding:0;border:1px solid #374138;border-radius:6px;background:#121613cc;cursor:grab;touch-action:none;opacity:.75;transition:opacity .15s ease,border-color .15s ease,box-shadow .15s ease;}",
    ".vp-section-grip span{width:2px;height:2px;border-radius:50%;background:#93a096;}",
    ".vp-section-grip:hover,.vp-section-grip:focus-visible{opacity:1;border-color:#4d6253;outline:none;box-shadow:0 0 0 2px #22c55e44;}",
    ".vp-section-grip:active{cursor:grabbing;}",
    "#tool-preview-section>.vp-section-grip{right:33px;}",
    "#color-palette-section>.vp-section-grip{top:36px;}",
    ".vp-section-floating{position:fixed!important;z-index:70!important;width:280px!important;min-width:220px!important;max-height:calc(100vh - 76px)!important;margin:0!important;overflow:auto!important;resize:both;border:1px solid #35443b!important;border-radius:12px!important;background:#121713!important;box-shadow:0 20px 54px #000b!important;padding:12px!important;}",
    ".vp-section-floating::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 1px 0 #ffffff0d;}",
    ".vp-section-docked-right{position:relative!important;width:100%!important;max-height:none!important;margin:0!important;border:1px solid #2f3d34!important;border-radius:12px!important;background:#121713!important;box-shadow:0 10px 28px #0007!important;padding:12px!important;overflow:auto!important;}",
    ".vp-section-placeholder{height:12px;margin:4px 0;border:1px dashed #2c3b30;border-radius:7px;background:#22c55e08;transition:border-color .15s ease,background .15s ease,box-shadow .15s ease;}",
    ".vp-section-placeholder.is-target{border-color:#22c55e;background:#22c55e22;box-shadow:0 0 18px #22c55e44;}",
    "#vp-section-dock{position:fixed;top:70px;right:8px;bottom:8px;z-index:60;display:none;flex-direction:column;gap:8px;width:296px;max-width:calc(100vw - 16px);padding:4px;overflow:auto;pointer-events:none;}",
    "#vp-section-dock.has-items{display:flex;}",
    "#vp-section-dock>*{pointer-events:auto;flex:0 0 auto;}",
    "#vp-section-snap{position:fixed;z-index:59;display:none;border:2px dashed #22c55e;border-radius:12px;background:#22c55e16;box-shadow:0 0 28px #22c55e33,inset 0 0 24px #22c55e12;pointer-events:none;transition:opacity .12s ease;}",
    "#vp-section-snap.is-active{display:block;animation:vp-dock-pulse .9s ease-in-out infinite alternate;}",
    "@keyframes vp-dock-pulse{from{opacity:.55}to{opacity:1}}",
    "body.vp-section-dragging,body.vp-section-dragging *{cursor:grabbing!important;user-select:none!important;}",
    "details.nav-nested[open]>summary{background:#292929;color:var(--accent-color,#22c55e);}"
  ].join("");
  document.head.appendChild(style);

  function init() {
    if (document.getElementById("vp-section-dock")) return;

    var properties = document.getElementById("properties");
    if (!properties) {
      setTimeout(init, 120);
      return;
    }

    var header = document.querySelector("header");
    var dockRoot = document.createElement("div");
    dockRoot.id = "vp-section-dock";
    dockRoot.setAttribute("aria-label", "Dock panel");
    document.body.appendChild(dockRoot);

    var snapEl = document.createElement("div");
    snapEl.id = "vp-section-snap";
    document.body.appendChild(snapEl);

    var records = [];
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (error) { saved = {}; }

    function minTop() {
      return (header ? header.offsetHeight : 56) + 8;
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }

    function saveLayout() {
      var data = {};
      records.forEach(function (rec) {
        var rect = rec.el.getBoundingClientRect();
        data[rec.id] = {
          mode: rec.mode,
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: rec.mode === "float" ? Math.round(rect.height) : 0
        };
      });
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (error) {}
    }

    function updateDockVisibility() {
      dockRoot.classList.toggle("has-items", dockRoot.children.length > 0);
    }

    function ensurePlaceholder(rec) {
      if (rec.placeholder && rec.placeholder.isConnected) return rec.placeholder;
      var placeholder = document.createElement("div");
      placeholder.className = "vp-section-placeholder";
      placeholder.dataset.sectionPlaceholder = rec.id;
      placeholder.title = "Return section to sidebar";
      var parent = rec.homeParent && rec.homeParent.isConnected ? rec.homeParent : properties;
      parent.insertBefore(placeholder, rec.el.parentElement === parent ? rec.el : null);
      rec.placeholder = placeholder;
      return placeholder;
    }

    function clearFloatingStyle(el) {
      ["position", "left", "top", "right", "bottom", "width", "height", "max-height", "margin", "z-index", "resize"].forEach(function (property) {
        el.style.removeProperty(property);
      });
    }

    function animateTo(rec, before, moved) {
      if (!before) return;
      requestAnimationFrame(function () {
        var after = rec.el.getBoundingClientRect();
        var dx = before.left - after.left;
        var dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        rec.el.animate(
          [
            { transform: "translate(" + dx + "px," + dy + "px)", opacity: 0.88 },
            { transform: "translate(0,0)", opacity: 1 }
          ],
          { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      });
    }

    function dockHome(rec, animate) {
      var before = rec.el.getBoundingClientRect();
      var placeholder = ensurePlaceholder(rec);
      var parent = placeholder.parentElement || rec.homeParent || properties;
      parent.insertBefore(rec.el, placeholder);
      placeholder.remove();
      rec.placeholder = null;
      rec.el.classList.remove("vp-section-floating", "vp-section-docked-right");
      clearFloatingStyle(rec.el);
      rec.mode = "home";
      updateDockVisibility();
      if (animate !== false) animateTo(rec, before, true);
      saveLayout();
    }

    function dockRight(rec, animate) {
      var before = rec.el.getBoundingClientRect();
      ensurePlaceholder(rec);
      rec.el.classList.remove("vp-section-floating");
      rec.el.classList.add("vp-section-docked-right");
      clearFloatingStyle(rec.el);
      dockRoot.appendChild(rec.el);
      rec.mode = "right";
      updateDockVisibility();
      if (animate !== false) animateTo(rec, before, true);
      saveLayout();
    }

    function floatSection(rec, left, top, width, height) {
      var rect = rec.el.getBoundingClientRect();
      ensurePlaceholder(rec);
      rec.el.classList.remove("vp-section-docked-right");
      rec.el.classList.add("vp-section-floating");
      document.body.appendChild(rec.el);
      rec.mode = "float";
      updateDockVisibility();
      rec.el.style.left = clamp(left == null ? rect.left : left, 6, Math.max(6, window.innerWidth - (width || rect.width) - 6)) + "px";
      rec.el.style.top = clamp(top == null ? rect.top : top, minTop(), Math.max(minTop(), window.innerHeight - (height || rect.height) - 8)) + "px";
      rec.el.style.width = Math.max(220, Math.round(width || rect.width)) + "px";
      if (height) rec.el.style.height = Math.round(height) + "px";
      saveLayout();
    }

    function hideSnap(rec) {
      snapEl.classList.remove("is-active");
      records.forEach(function (item) {
        if (item.placeholder) item.placeholder.classList.remove("is-target");
      });
    }

    function showTarget(rec, target) {
      if (!target) {
        hideSnap(rec);
        return;
      }
      records.forEach(function (item) {
        if (item.placeholder) item.placeholder.classList.remove("is-target");
      });
      var rect;
      if (target === "home") {
        rect = (rec.homeParent || properties).getBoundingClientRect();
        if (rec.placeholder) rec.placeholder.classList.add("is-target");
      } else {
        rect = { left: window.innerWidth - 304, top: minTop(), width: 296, height: window.innerHeight - minTop() - 8 };
      }
      snapEl.style.left = Math.max(4, rect.left) + "px";
      snapEl.style.top = Math.max(4, rect.top) + "px";
      snapEl.style.width = Math.max(24, rect.width) + "px";
      snapEl.style.height = Math.max(24, rect.height) + "px";
      snapEl.classList.add("is-active");
    }

    function findTarget(rec, x, y) {
      var homeRect = (rec.homeParent || properties).getBoundingClientRect();
      var overHome = x >= homeRect.left - 46 && x <= homeRect.right + 46 && y >= homeRect.top - 24 && y <= homeRect.bottom + 24;
      if (overHome || x < 72) return "home";
      if (x > window.innerWidth - 92) return "right";
      return null;
    }

    function setGripTitle(rec) {
      if (!rec.grip) return;
      rec.grip.title = rec.mode === "home" ? "Drag to float / double-click to float" : "Drag to dock / double-click to return";
      rec.grip.setAttribute("aria-label", rec.mode === "home" ? "Float section" : "Return section to sidebar");
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
        if (rec.mode === "home") {
          var rect = rec.el.getBoundingClientRect();
          floatSection(rec, rect.left, rect.top, rect.width, rect.height);
        } else {
          dockHome(rec);
        }
        setGripTitle(rec);
      });

      grip.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        var startX = event.clientX;
        var startY = event.clientY;
        var startRect = rec.el.getBoundingClientRect();
        var offsetX = startX - startRect.left;
        var offsetY = startY - startRect.top;
        var started = false;
        var target = null;

        function startDrag() {
          if (started) return;
          started = true;
          document.body.classList.add("vp-section-dragging");
          if (rec.mode !== "float") floatSection(rec, startRect.left, startRect.top, startRect.width, startRect.height);
        }

        function onMove(moveEvent) {
          if (!started && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4) return;
          startDrag();
          var rect = rec.el.getBoundingClientRect();
          var left = clamp(moveEvent.clientX - offsetX, 6, Math.max(6, window.innerWidth - rect.width - 6));
          var top = clamp(moveEvent.clientY - offsetY, minTop(), Math.max(minTop(), window.innerHeight - rect.height - 8));
          rec.el.style.left = Math.round(left) + "px";
          rec.el.style.top = Math.round(top) + "px";
          target = findTarget(rec, moveEvent.clientX, moveEvent.clientY);
          showTarget(rec, target);
        }

        function finish() {
          grip.removeEventListener("pointermove", onMove);
          grip.removeEventListener("pointerup", finish);
          grip.removeEventListener("pointercancel", cancel);
          if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
          document.body.classList.remove("vp-section-dragging");
          hideSnap(rec);
          if (!started) return;
          if (target === "home") dockHome(rec);
          else if (target === "right") dockRight(rec);
          else saveLayout();
          setGripTitle(rec);
        }

        function cancel() {
          grip.removeEventListener("pointermove", onMove);
          grip.removeEventListener("pointerup", finish);
          grip.removeEventListener("pointercancel", cancel);
          document.body.classList.remove("vp-section-dragging");
          hideSnap(rec);
          if (started) dockHome(rec, false);
          setGripTitle(rec);
        }

        grip.setPointerCapture(event.pointerId);
        grip.addEventListener("pointermove", onMove);
        grip.addEventListener("pointerup", finish);
        grip.addEventListener("pointercancel", cancel);
      });
    }

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
        mode: "home"
      };
      records.push(rec);
      wireGrip(rec);
    });

    if (!records.length) return;

    records.forEach(function (rec) {
      var state = saved[rec.id];
      if (!state || state.mode === "home") return;
      ensurePlaceholder(rec);
      if (state.mode === "right") {
        rec.el.classList.add("vp-section-docked-right");
        dockRoot.appendChild(rec.el);
        rec.mode = "right";
      } else {
        rec.el.classList.add("vp-section-floating");
        document.body.appendChild(rec.el);
        rec.mode = "float";
        rec.el.style.left = clamp(state.left, 6, Math.max(6, window.innerWidth - (state.width || 280) - 6)) + "px";
        rec.el.style.top = clamp(state.top, minTop(), Math.max(minTop(), window.innerHeight - 80)) + "px";
        rec.el.style.width = Math.max(220, state.width || 280) + "px";
        if (state.height) rec.el.style.height = Math.max(120, state.height) + "px";
      }
      setGripTitle(rec);
    });
    updateDockVisibility();

    var resetButton = document.getElementById("panel-layout-reset");
    if (resetButton) {
      resetButton.addEventListener("click", function () {
        records.forEach(function (rec) {
          dockHome(rec, false);
          setGripTitle(rec);
        });
        dockRoot.innerHTML = "";
        try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}
        updateDockVisibility();
      });
    }

    window.addEventListener("resize", function () {
      records.forEach(function (rec) {
        if (rec.mode !== "float") return;
        var rect = rec.el.getBoundingClientRect();
        rec.el.style.left = clamp(rect.left, 6, Math.max(6, window.innerWidth - rect.width - 6)) + "px";
        rec.el.style.top = clamp(rect.top, minTop(), Math.max(minTop(), window.innerHeight - rect.height - 8)) + "px";
      });
    });
  }

  function enableNestedMenuHover() {
    if (document.documentElement.dataset.nestedHoverReady === "1") return;
    document.documentElement.dataset.nestedHoverReady = "1";
    var openTimer = null;
    var closeTimer = null;

    function nestedOf(target) {
      return target instanceof Element ? target.closest("details.nav-nested") : null;
    }

    document.addEventListener("pointerover", function (event) {
      if (event.pointerType === "touch") return;
      var nested = nestedOf(event.target);
      var top = event.target instanceof Element ? event.target.closest("details.navigation-submenu") : null;
      if (!nested && !top) return;
      if (nested && event.relatedTarget instanceof Node && nested.contains(event.relatedTarget)) return;
      if (!nested && event.relatedTarget instanceof Node && top && top.contains(event.relatedTarget)) return;
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      openTimer = setTimeout(function () {
        if (nested && nested.isConnected) {
          nested.open = true;
        } else if (top && top.isConnected) {
          var menu = document.querySelector("details.main-navigation, #main-navigation");
          if (menu && !menu.open) return;
          top.open = true;
        }
      }, 65);
    });

    document.addEventListener("pointerout", function (event) {
      if (event.pointerType === "touch") return;
      var nested = nestedOf(event.target);
      if (!nested) return;
      if (event.relatedTarget instanceof Node && nested.contains(event.relatedTarget)) return;
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () {
        if (nested.isConnected) nested.open = false;
      }, 170);
    });
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
