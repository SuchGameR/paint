(function () {
  "use strict";

  var STORAGE_KEY = "verse.section-dock.v2";
  var SECTION_IDS = [
    "layers-section",
    "tool-preview-section",
    "color-palette-section",
    "tool-context-section",
    "swatch-palette-section"
  ];
  var EDGES = ["top", "right", "bottom", "left"];
  var DOCK_CLASSES = EDGES.map(function (edge) { return "vp-section-docked-" + edge; }).concat(["vp-section-docked"]);

  var style = document.createElement("style");
  style.textContent = [
    ".vp-section-host{position:relative!important;}",
    ".vp-section-grip{position:absolute;top:5px;right:5px;z-index:12;display:grid;grid-template-columns:repeat(2,2px);grid-template-rows:repeat(3,2px);gap:2px;width:17px;height:23px;place-content:center;padding:0;border:1px solid #374138;border-radius:6px;background:#121613cc;cursor:grab;touch-action:none;opacity:.75;transition:opacity .15s ease,border-color .15s ease,box-shadow .15s ease;}",
    ".vp-section-grip span{width:2px;height:2px;border-radius:50%;background:#93a096;}",
    ".vp-section-grip:hover,.vp-section-grip:focus-visible{opacity:1;border-color:#4d6253;outline:none;box-shadow:0 0 0 2px #22c55e44;}",
    ".vp-section-grip:active{cursor:grabbing;}",
    "#tool-preview-section>.vp-section-grip{right:33px;}",
    "#color-palette-section>.vp-section-grip{top:36px;}",
    ".vp-section-floating{position:fixed!important;z-index:70!important;width:280px!important;min-width:220px!important;max-height:calc(100vh - 76px)!important;margin:0!important;overflow:auto!important;resize:both;border:1px solid #35443b!important;border-radius:12px!important;background:#121713!important;box-shadow:0 20px 54px #000b!important;padding:12px!important;will-change:transform;}",
    ".vp-section-floating::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 1px 0 #ffffff0d;}",
    ".vp-section-docked{position:relative!important;flex:0 0 auto!important;margin:0!important;border:1px solid #2f3d34!important;border-radius:12px!important;background:#121713!important;box-shadow:0 10px 28px #0007!important;padding:12px!important;overflow:auto!important;}",
    ".vp-section-docked-top,.vp-section-docked-bottom{width:320px!important;max-width:calc(50vw - 48px)!important;max-height:42vh!important;}",
    ".vp-section-docked-left,.vp-section-docked-right{width:100%!important;max-height:none!important;}",
    ".vp-section-placeholder{height:12px;margin:4px 0;border:1px dashed #2c3b30;border-radius:7px;background:#22c55e08;transition:border-color .15s ease,background .15s ease,box-shadow .15s ease;}",
    ".vp-section-placeholder.is-target{border-color:#22c55e;background:#22c55e22;box-shadow:0 0 18px #22c55e44;}",
    ".vp-section-dock{position:fixed;z-index:60;display:none;gap:8px;padding:4px;overflow:auto;pointer-events:none;scrollbar-width:thin;}",
    ".vp-section-dock.has-items{display:flex;flex-wrap:wrap;}",
    ".vp-section-dock>*{pointer-events:auto;}",
    "#vp-section-dock-top,#vp-section-dock-bottom{flex-direction:row;align-items:flex-start;}",
    "#vp-section-dock-left,#vp-section-dock-right{flex-direction:column;flex-wrap:nowrap;}",
    ".vp-section-home-snap{position:fixed;z-index:58;display:none;border:2px dashed #22c55e;border-radius:12px;background:#22c55e16;box-shadow:0 0 28px #22c55e33,inset 0 0 24px #22c55e12;pointer-events:none;}",
    ".vp-section-home-snap.is-active{display:block;animation:vp-dock-pulse .9s ease-in-out infinite alternate;}",
    ".vp-dock-zone{position:fixed;z-index:59;display:none;pointer-events:none;border:2px dashed #22c55e99;border-radius:12px;background:#22c55e12;box-shadow:inset 0 0 24px #22c55e10;opacity:0;transition:opacity .12s ease,background .12s ease,box-shadow .12s ease;}",
    ".vp-dock-zone.is-visible{display:block;opacity:.28;}",
    ".vp-dock-zone.is-active{display:block;opacity:1;background:#22c55e2e;box-shadow:0 0 30px #22c55e50,inset 0 0 34px #22c55e22;animation:vp-dock-pulse .9s ease-in-out infinite alternate;}",
    ".vp-dock-zone::before{position:absolute;top:8px;left:50%;padding:3px 8px;border-radius:999px;background:#07120acc;color:#bff7d2;font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;transform:translateX(-50%);content:attr(data-label);}",
    ".vp-dock-zone[data-edge=left]::before,.vp-dock-zone[data-edge=right]::before{top:50%;left:8px;transform:translateY(-50%) rotate(-90deg);transform-origin:left center;}",
    "@keyframes vp-dock-pulse{from{opacity:.55}to{opacity:1}}",
    "body.vp-section-dragging{user-select:none!important;cursor:grabbing!important;}",
    ".vp-section-floating.is-dragging{pointer-events:none!important;contain:layout paint;box-shadow:0 10px 22px #0009!important;}",
    "details.nav-nested[open]>summary{background:#292929;color:var(--accent-color,#22c55e);}"
  ].join("");
  document.head.appendChild(style);

  function init() {
    if (document.getElementById("vp-section-dock-top")) return;

    var properties = document.getElementById("properties");
    var canvasPane = document.querySelector(".canvas") || document.getElementById("canvas");
    if (!properties || !canvasPane) {
      setTimeout(init, 120);
      return;
    }

    var header = document.querySelector("header");
    var docks = {};
    EDGES.forEach(function (edge) {
      var dock = document.createElement("div");
      dock.id = "vp-section-dock-" + edge;
      dock.className = "vp-section-dock";
      dock.dataset.edge = edge;
      dock.setAttribute("aria-label", "Dock " + edge);
      document.body.appendChild(dock);
      docks[edge] = dock;
    });

    var homeSnap = document.createElement("div");
    homeSnap.className = "vp-section-home-snap";
    document.body.appendChild(homeSnap);

    var zoneEls = {};
    EDGES.forEach(function (edge) {
      var zone = document.createElement("div");
      zone.className = "vp-dock-zone";
      zone.dataset.edge = edge;
      zone.dataset.label = edge === "top" ? "上" : edge === "right" ? "右" : edge === "bottom" ? "下" : "左";
      document.body.appendChild(zone);
      zoneEls[edge] = zone;
    });

    var records = [];
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (error) { saved = {}; }

    function minTop() {
      return (header ? header.offsetHeight : 56) + 8;
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }

    function canvasRect() {
      return canvasPane.getBoundingClientRect();
    }

    function layoutDockContainers() {
      var r = canvasRect();
      var margin = 8;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var left = Math.round(r.left + margin);
      var right = Math.round(vw - r.right + margin);
      var top = Math.round(r.top + margin);
      var bottom = Math.round(vh - r.bottom + margin);
      var verticalWidth = Math.round(clamp(r.width * 0.42, 210, 304));

      [docks.top, docks.bottom].forEach(function (dock) {
        dock.style.left = left + "px";
        dock.style.right = right + "px";
        dock.style.width = "auto";
      });
      docks.top.style.top = top + "px";
      docks.top.style.bottom = "auto";
      docks.top.style.height = "auto";
      docks.bottom.style.top = "auto";
      docks.bottom.style.bottom = bottom + "px";
      docks.bottom.style.height = "auto";

      [docks.left, docks.right].forEach(function (dock) {
        dock.style.top = top + "px";
        dock.style.bottom = bottom + "px";
        dock.style.height = "auto";
        dock.style.width = verticalWidth + "px";
      });
      docks.left.style.left = left + "px";
      docks.left.style.right = "auto";
      docks.right.style.left = "auto";
      docks.right.style.right = right + "px";
    }

    function zoneRects(r) {
      r = r || canvasRect();
      var inset = 4;
      var band = Math.round(clamp(Math.min(r.width, r.height) * 0.3, 96, 170));
      return {
        top: { left: r.left + inset, top: r.top + inset, width: r.width - inset * 2, height: band },
        right: { left: r.right - inset - band, top: r.top + inset, width: band, height: r.height - inset * 2 },
        bottom: { left: r.left + inset, top: r.bottom - inset - band, width: r.width - inset * 2, height: band },
        left: { left: r.left + inset, top: r.top + inset, width: band, height: r.height - inset * 2 }
      };
    }

    function placeZone(zone, rect) {
      zone.style.left = Math.max(4, Math.round(rect.left)) + "px";
      zone.style.top = Math.max(4, Math.round(rect.top)) + "px";
      zone.style.width = Math.max(24, Math.round(rect.width)) + "px";
      zone.style.height = Math.max(24, Math.round(rect.height)) + "px";
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
      EDGES.forEach(function (edge) {
        docks[edge].classList.toggle("has-items", docks[edge].children.length > 0);
      });
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
      ["position", "left", "top", "right", "bottom", "width", "height", "max-height", "margin", "z-index", "resize", "transform", "will-change"].forEach(function (property) {
        el.style.removeProperty(property);
      });
    }

    function animateTo(rec, before) {
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
      rec.el.classList.remove.apply(rec.el.classList, ["vp-section-floating"].concat(DOCK_CLASSES));
      clearFloatingStyle(rec.el);
      rec.mode = "home";
      updateDockVisibility();
      if (animate !== false) animateTo(rec, before);
      saveLayout();
    }

    function dockTo(rec, edge, animate) {
      if (EDGES.indexOf(edge) < 0) return;
      var before = rec.el.getBoundingClientRect();
      ensurePlaceholder(rec);
      rec.el.classList.remove.apply(rec.el.classList, ["vp-section-floating"].concat(DOCK_CLASSES));
      rec.el.classList.add("vp-section-docked", "vp-section-docked-" + edge);
      clearFloatingStyle(rec.el);
      docks[edge].appendChild(rec.el);
      rec.mode = "dock-" + edge;
      updateDockVisibility();
      layoutDockContainers();
      if (animate !== false) animateTo(rec, before);
      saveLayout();
    }

    function floatSection(rec, left, top, width, height) {
      var rect = rec.el.getBoundingClientRect();
      ensurePlaceholder(rec);
      rec.el.classList.remove.apply(rec.el.classList, DOCK_CLASSES);
      rec.el.classList.add("vp-section-floating");
      document.body.appendChild(rec.el);
      rec.mode = "float";
      updateDockVisibility();
      rec.el.style.left = clamp(left == null ? rect.left : left, 6, Math.max(6, window.innerWidth - (width || rect.width) - 6)) + "px";
      rec.el.style.top = clamp(top == null ? rect.top : top, minTop(), Math.max(minTop(), window.innerHeight - (height || rect.height) - 8)) + "px";
      rec.el.style.width = Math.max(220, Math.round(width || rect.width)) + "px";
      if (height) rec.el.style.height = Math.round(height) + "px";
      rec.el.style.transform = "none";
      saveLayout();
    }

    function hideZones(rec) {
      homeSnap.classList.remove("is-active");
      EDGES.forEach(function (edge) {
        zoneEls[edge].classList.remove("is-visible", "is-active");
      });
      records.forEach(function (item) {
        if (item.placeholder) item.placeholder.classList.remove("is-target");
      });
    }

    function showZones(rec, target, dragGeometry) {
      var activeEdge = target && target.indexOf("dock-") === 0 ? target.slice(5) : null;
      var rects = dragGeometry ? dragGeometry.zones : zoneRects();
      EDGES.forEach(function (edge) {
        var zone = zoneEls[edge];
        placeZone(zone, rects[edge]);
        zone.classList.add("is-visible");
        zone.classList.toggle("is-active", edge === activeEdge);
      });
      var homeActive = target === "home";
      homeSnap.classList.toggle("is-active", homeActive);
      if (homeActive) {
        var homeRect = dragGeometry
          ? dragGeometry.home
          : (rec.homeParent || properties).getBoundingClientRect();
        placeZone(homeSnap, homeRect);
      }
      if (rec.placeholder) rec.placeholder.classList.toggle("is-target", homeActive);
    }

    function rectRight(rect) {
      return rect.right != null ? rect.right : rect.left + rect.width;
    }

    function rectBottom(rect) {
      return rect.bottom != null ? rect.bottom : rect.top + rect.height;
    }

    function pointInRect(x, y, rect, pad) {
      pad = pad || 0;
      return x >= rect.left - pad && x <= rectRight(rect) + pad && y >= rect.top - pad && y <= rectBottom(rect) + pad;
    }

    function findTarget(rec, x, y, dragGeometry) {
      var rects = dragGeometry ? dragGeometry.zones : zoneRects();
      for (var i = 0; i < EDGES.length; i++) {
        var edge = EDGES[i];
        if (pointInRect(x, y, rects[edge], 0)) return "dock-" + edge;
      }
      var homeRect = dragGeometry
        ? dragGeometry.home
        : (rec.homeParent || properties).getBoundingClientRect();
      if (pointInRect(x, y, homeRect, 0)) return "home";
      return null;
    }

    function setGripTitle(rec) {
      if (!rec.grip) return;
      rec.grip.title = rec.mode === "home"
        ? "ドラッグしてキャンバスの上下左右にドッキング"
        : "ドラッグして上下左右へ移動・ダブルクリックで元の位置に戻す";
      rec.grip.setAttribute("aria-label", rec.mode === "home"
        ? "セクションを上下左右にドッキング"
        : "セクションを移動または元の位置に戻す");
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
        var startLeft = startRect.left;
        var startTop = startRect.top;
        var dragWidth = startRect.width;
        var dragHeight = startRect.height;
        var started = false;
        var target = null;
        var frame = null;
        var dragGeometry = null;
        var lastPoint = { x: startX, y: startY };
        var tx = 0;
        var ty = 0;

        function startDrag() {
          if (started) return;
          started = true;
          document.body.classList.add("vp-section-dragging");
          if (rec.mode !== "float") floatSection(rec, startLeft, startTop, dragWidth, dragHeight);
          rec.el.style.transform = "none";
          rec.el.classList.add("is-dragging");
          dragGeometry = {
            zones: zoneRects(canvasRect()),
            home: (rec.homeParent || properties).getBoundingClientRect()
          };
          target = findTarget(rec, startX, startY, dragGeometry);
          showZones(rec, target, dragGeometry);
        }

        function applyMove() {
          frame = null;
          if (!started) return;
          tx = lastPoint.x - startX;
          ty = lastPoint.y - startY;
          var minLeft = 6 - startLeft;
          var maxLeft = Math.max(minLeft, window.innerWidth - dragWidth - 6 - startLeft);
          var minTopDelta = minTop() - startTop;
          var maxTopDelta = Math.max(minTopDelta, window.innerHeight - dragHeight - 8 - startTop);
          tx = clamp(tx, minLeft, maxLeft);
          ty = clamp(ty, minTopDelta, maxTopDelta);
          rec.el.style.transform = "translate3d(" + Math.round(tx) + "px," + Math.round(ty) + "px,0)";
          var nextTarget = findTarget(rec, lastPoint.x, lastPoint.y, dragGeometry);
          if (nextTarget !== target) {
            target = nextTarget;
            showZones(rec, target, dragGeometry);
          }
        }

        function onMove(moveEvent) {
          if (!started && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4) return;
          startDrag();
          lastPoint.x = moveEvent.clientX;
          lastPoint.y = moveEvent.clientY;
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
          hideZones(rec);
        }

        function finish(finishEvent) {
          if (started && finishEvent) {
            lastPoint.x = finishEvent.clientX;
            lastPoint.y = finishEvent.clientY;
            var nextTarget = findTarget(rec, lastPoint.x, lastPoint.y, dragGeometry);
            if (nextTarget !== target) {
              target = nextTarget;
              showZones(rec, target, dragGeometry);
            }
            if (frame) {
              cancelAnimationFrame(frame);
              frame = null;
            }
            applyMove();
          }
          cleanup();
          if (!started) return;
          if (target === "home") {
            dockHome(rec);
          } else if (target && target.indexOf("dock-") === 0) {
            dockTo(rec, target.slice(5));
          } else {
            rec.el.style.left = Math.round(startLeft + tx) + "px";
            rec.el.style.top = Math.round(startTop + ty) + "px";
            rec.el.style.transform = "none";
            saveLayout();
          }
          setGripTitle(rec);
        }

        function cancel() {
          cleanup();
          if (started) dockHome(rec, false);
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
          mode: "home"
        };
        records.push(rec);
        wireGrip(rec);
      });
      return records.length;
    }

    collectSections();
    if (!records.length) return;

    layoutDockContainers();

    records.forEach(function (rec) {
      var state = saved[rec.id];
      if (!state || state.mode === "home") return;
      var mode = state.mode === "right" ? "dock-right" : state.mode;
      ensurePlaceholder(rec);
      if (mode === "float") {
        rec.el.classList.add("vp-section-floating");
        document.body.appendChild(rec.el);
        rec.mode = "float";
        rec.el.style.left = clamp(state.left, 6, Math.max(6, window.innerWidth - (state.width || 280) - 6)) + "px";
        rec.el.style.top = clamp(state.top, minTop(), Math.max(minTop(), window.innerHeight - 80)) + "px";
        rec.el.style.width = Math.max(220, state.width || 280) + "px";
        if (state.height) rec.el.style.height = Math.max(120, state.height) + "px";
      } else if (mode.indexOf("dock-") === 0 && EDGES.indexOf(mode.slice(5)) >= 0) {
        var edge = mode.slice(5);
        rec.el.classList.add("vp-section-docked", "vp-section-docked-" + edge);
        docks[edge].appendChild(rec.el);
        rec.mode = mode;
      }
      setGripTitle(rec);
    });
    updateDockVisibility();
    layoutDockContainers();

    var resetButton = document.getElementById("panel-layout-reset");
    if (resetButton) {
      resetButton.addEventListener("click", function () {
        records.forEach(function (rec) {
          dockHome(rec, false);
          setGripTitle(rec);
        });
        EDGES.forEach(function (edge) { docks[edge].innerHTML = ""; });
        try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}
        updateDockVisibility();
      });
    }

    var layoutFrame = null;
    function scheduleDockLayout() {
      if (layoutFrame) return;
      layoutFrame = requestAnimationFrame(function () {
        layoutFrame = null;
        layoutDockContainers();
      });
    }

    window.addEventListener("resize", function () {
      scheduleDockLayout();
      records.forEach(function (rec) {
        if (rec.mode !== "float") return;
        var rect = rec.el.getBoundingClientRect();
        rec.el.style.left = clamp(rect.left, 6, Math.max(6, window.innerWidth - rect.width - 6)) + "px";
        rec.el.style.top = clamp(rect.top, minTop(), Math.max(minTop(), window.innerHeight - rect.height - 8)) + "px";
      });
    });
    window.addEventListener("scroll", scheduleDockLayout, true);
    if (window.ResizeObserver) new ResizeObserver(scheduleDockLayout).observe(canvasPane);

    // Sections such as the layer panel may be injected slightly later by other scripts.
    [120, 360, 900].forEach(function (delay) {
      setTimeout(function () {
        var before = records.length;
        collectSections();
        if (records.length !== before) {
          layoutDockContainers();
          updateDockVisibility();
        }
      }, delay);
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
