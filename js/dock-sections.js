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
  var SLOT_LABELS = {
    header: "ヘッダー",
    properties: "プロパティ",
    tools: "ツール",
    footer: "フッター"
  };
  var SECTION_LABELS = {
    "layers-section": "レイヤー",
    "tool-preview-section": "プレビュー",
    "color-palette-section": "カラーパレット",
    "tool-context-section": "ツール設定",
    "swatch-palette-section": "色見本"
  };

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
    ".vp-section-floating.is-dragging{pointer-events:none!important;contain:layout paint;box-shadow:0 8px 18px #0008!important;will-change:transform;}",
    ".vp-section-docked-slot{position:relative!important;flex:0 0 auto!important;margin:0!important;border:1px solid #2f3d34!important;border-radius:10px!important;background:#121713!important;padding:10px!important;overflow:auto!important;max-height:100%;}",
    "header.vp-drop-host,footer#app-footer.vp-drop-host{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}",
    "header.vp-drop-host>.vp-section-docked-slot,footer#app-footer.vp-drop-host>.vp-section-docked-slot{max-width:min(360px,46vw);max-height:46vh;}",
    "#tools.vp-drop-host{display:flex;flex-direction:column;gap:8px;}",
    "#tools.vp-drop-host>.vp-section-docked-slot{width:100%;max-height:40vh;}",
    "#properties.vp-drop-host.is-drop-target,#tools.vp-drop-host.is-drop-target,header.vp-drop-host.is-drop-target,footer#app-footer.vp-drop-host.is-drop-target{outline:2px dashed #22c55e88;outline-offset:-2px;background-image:linear-gradient(#22c55e14,#22c55e14);}",
    ".vp-section-placeholder{display:none;height:10px;margin:4px 0;border:1px dashed #2c3b30;border-radius:6px;background:#22c55e10;}",
    ".vp-section-placeholder.is-visible{display:block;}",
    ".vp-section-placeholder.is-target{border-color:#22c55e;background:#22c55e28;}",
    "#app-footer{display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 10px;border-top:1px solid #222822;background:#0b0b0b;color:#a7aaa8;font-size:12px;}",
    "#app-footer .app-footer-label{opacity:.55;margin-right:4px;white-space:nowrap;}",
    "#app-footer.vp-slot-empty:not(.is-drop-target){display:none!important;}",
    "body.vp-section-dragging #app-footer.vp-slot-empty{display:flex!important;border-top-style:dashed;border-top-color:#22c55e55;}",
    "body.vp-footer-visible main{height:calc(100vh - 95px);}",
    "body:not(.vp-footer-visible) main{height:calc(100vh - 55px);}",
    "body.vp-section-dragging{user-select:none!important;cursor:grabbing!important;}",
    "body.vp-section-dragging iframe{pointer-events:none!important;}",
    ".vp-dock-menu{position:fixed;z-index:95;min-width:170px;padding:6px;border:1px solid #33443a;border-radius:10px;background:#121713f2;box-shadow:0 14px 34px #000b;backdrop-filter:blur(8px);font-family:var(--system-font,'Arial',sans-serif);color:#dfe7e1;}",
    ".vp-dock-menu-title{padding:5px 8px 7px;color:#8e9a90;font-size:10px;font-weight:600;letter-spacing:.06em;}",
    ".vp-dock-menu button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;padding:7px 8px;border:0;border-radius:6px;background:transparent;color:#dfe7e1;font-size:11px;text-align:left;cursor:pointer;}",
    ".vp-dock-menu button:hover,.vp-dock-menu button:focus-visible{outline:none;background:#22c55e22;color:#fff;}",
    ".vp-dock-menu button.is-current{color:#22c55e;}",
    ".vp-dock-menu button span{color:#8e9a90;font-size:9px;}",
    ".vp-dock-menu-separator{height:1px;margin:5px 4px;background:#2d3a32;}",
    "details.nav-nested[open]>summary{background:#292929;color:var(--accent-color,#22c55e);}"
  ].join("");
  document.head.appendChild(style);

  var dockMenu = null;
  var closeDockMenu = function () {
    if (dockMenu) {
      dockMenu.remove();
      dockMenu = null;
    }
  };

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
    var restoring = true;
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
      if (restoring) return;
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

    function isFooterEmpty() {
      return !footer || !footer.querySelector(".vp-section-docked-slot");
    }

    function updateFooterVisibility() {
      if (!footer) return;
      var empty = isFooterEmpty();
      var dragging = document.body.classList.contains("vp-section-dragging");
      footer.classList.toggle("vp-slot-empty", empty);
      document.body.classList.toggle("vp-footer-visible", !empty || dragging);
    }

    function ensurePlaceholder(rec, visible) {
      if (!rec.placeholder || !rec.placeholder.isConnected) {
        var placeholder = document.createElement("div");
        placeholder.className = "vp-section-placeholder";
        placeholder.dataset.sectionPlaceholder = rec.id;
        var parent = rec.homeParent && rec.homeParent.isConnected ? rec.homeParent : properties;
        if (rec.el.parentElement === parent) {
          parent.insertBefore(placeholder, rec.el);
        } else {
          parent.appendChild(placeholder);
        }
        rec.placeholder = placeholder;
      }
      if (rec.placeholder) {
        rec.placeholder.classList.toggle("is-visible", !!visible);
        rec.placeholder.classList.toggle("is-target", false);
      }
      return rec.placeholder;
    }

    function hidePlaceholder(rec) {
      if (!rec.placeholder) return;
      rec.placeholder.classList.remove("is-visible", "is-target");
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
      rec.el.classList.remove("vp-section-floating", "vp-section-docked-slot", "is-dragging");
      clearFloatingStyle(rec.el);
      if (slotId === "properties") {
        var placeholder = ensurePlaceholder(rec, false);
        var parent = rec.homeParent && rec.homeParent.isConnected
          ? rec.homeParent
          : (placeholder && placeholder.parentElement ? placeholder.parentElement : properties);
        if (placeholder && placeholder.parentElement === parent) {
          parent.insertBefore(rec.el, placeholder);
        } else {
          parent.appendChild(rec.el);
        }
        if (placeholder) {
          placeholder.remove();
          rec.placeholder = null;
        }
        rec.mode = "home";
        rec.slot = "properties";
      } else {
        if (rec.el.parentElement === rec.homeParent) ensurePlaceholder(rec, false);
        host.appendChild(rec.el);
        rec.el.classList.add("vp-section-docked-slot");
        rec.mode = "slot";
        rec.slot = slotId;
        ensurePlaceholder(rec, false);
      }
      if (animate !== false) {
        rec.el.classList.add("vp-section-settled");
        setTimeout(function () { rec.el.classList.remove("vp-section-settled"); }, 180);
      }
      updateFooterVisibility();
      setGripTitle(rec);
      saveLayout();
    }

    function floatSection(rec, left, top, width, height, silent) {
      var rect = rec.el.getBoundingClientRect();
      ensurePlaceholder(rec, false);
      rec.el.classList.remove("vp-section-docked-slot", "is-dragging");
      rec.el.classList.add("vp-section-floating");
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
      document.body.appendChild(rec.el);
      hidePlaceholder(rec);
      updateFooterVisibility();
      setGripTitle(rec);
      if (!silent) saveLayout();
    }

    function setGripTitle(rec) {
      if (!rec.grip) return;
      rec.grip.title = "クリックでクイック配置 · ドラッグして移動";
      rec.grip.setAttribute("aria-label", (SECTION_LABELS[rec.id] || "セクション") + "を移動（クリックでクイック配置）");
      rec.grip.setAttribute("aria-haspopup", "menu");
    }

    function openDockMenu(rec, x, y) {
      closeDockMenu();
      var menu = document.createElement("div");
      menu.className = "vp-dock-menu";
      menu.setAttribute("role", "menu");
      var title = document.createElement("div");
      title.className = "vp-dock-menu-title";
      title.textContent = (SECTION_LABELS[rec.id] || "セクション") + "の配置";
      menu.appendChild(title);

      SLOT_IDS.forEach(function (slotId) {
        if (!slots[slotId]) return;
        var button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.dataset.slot = slotId;
        var current = (slotId === "properties" && rec.mode === "home") || (rec.mode === "slot" && rec.slot === slotId);
        if (current) button.classList.add("is-current");
        var label = document.createElement("span");
        label.textContent = SLOT_LABELS[slotId];
        button.appendChild(label);
        var hint = document.createElement("span");
        hint.textContent = slotId === "footer" && isFooterEmpty() ? "空" : (current ? "現在" : "");
        button.appendChild(hint);
        button.addEventListener("click", function () {
          closeDockMenu();
          dockToSlot(rec, slotId);
        });
        menu.appendChild(button);
      });

      var separator = document.createElement("div");
      separator.className = "vp-dock-menu-separator";
      menu.appendChild(separator);

      var floatButton = document.createElement("button");
      floatButton.type = "button";
      floatButton.setAttribute("role", "menuitem");
      var floatLabel = document.createElement("span");
      floatLabel.textContent = "フロート表示";
      floatButton.appendChild(floatLabel);
      var floatHint = document.createElement("span");
      floatHint.textContent = rec.mode === "float" ? "現在" : "";
      floatButton.appendChild(floatHint);
      if (rec.mode === "float") floatButton.classList.add("is-current");
      floatButton.addEventListener("click", function () {
        closeDockMenu();
        var rect = rec.el.getBoundingClientRect();
        floatSection(rec, rect.left, rect.top, rect.width, rect.height);
      });
      menu.appendChild(floatButton);

      menu.addEventListener("pointerdown", function (event) {
        event.stopPropagation();
      });
      document.body.appendChild(menu);
      var menuRect = menu.getBoundingClientRect();
      var pos = clampPoint(x + 4, y + 4, menuRect.width, menuRect.height);
      menu.style.left = pos.left + "px";
      menu.style.top = pos.top + "px";
      dockMenu = menu;
      var firstButton = menu.querySelector("button");
      if (firstButton) firstButton.focus();
    }

    function wireGrip(rec) {
      var grip = document.createElement("button");
      grip.type = "button";
      grip.className = "vp-section-grip";
      grip.innerHTML = "<span></span><span></span><span></span><span></span><span></span><span></span>";
      rec.el.appendChild(grip);
      rec.grip = grip;
      setGripTitle(rec);

      grip.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        closeDockMenu();

        var pointerId = event.pointerId;
        var startX = event.clientX;
        var startY = event.clientY;
        var startRect = rec.el.getBoundingClientRect();
        var startLeft = startRect.left;
        var startTop = startRect.top;
        var dragWidth = startRect.width;
        var dragHeight = startRect.height;
        var originMode = rec.mode;
        var originSlot = rec.slot;
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
          if (rec.el.parentElement === rec.homeParent) {
            ensurePlaceholder(rec, true);
          } else {
            ensurePlaceholder(rec, false);
          }
          rec.el.classList.remove("vp-section-docked-slot");
          rec.el.classList.add("vp-section-floating", "is-dragging");
          document.body.appendChild(rec.el);
          rec.el.style.left = startLeft + "px";
          rec.el.style.top = startTop + "px";
          rec.el.style.right = "auto";
          rec.el.style.bottom = "auto";
          rec.el.style.width = dragWidth + "px";
          rec.el.style.height = dragHeight + "px";
          rec.el.style.margin = "0";
          rec.el.style.transform = "none";
          updateFooterVisibility();
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
          if (moveEvent.pointerId !== pointerId) return;
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
          if (!started && Math.hypot(lastX - startX, lastY - startY) < 4) return;
          startDrag();
          if (!frame) frame = requestAnimationFrame(applyMove);
        }

        function removeListeners() {
          window.removeEventListener("pointermove", onMove, true);
          window.removeEventListener("pointerup", finish, true);
          window.removeEventListener("pointercancel", cancel, true);
          window.removeEventListener("keydown", onKeyDown, true);
          if (frame) cancelAnimationFrame(frame);
          frame = null;
        }

        function cleanup() {
          removeListeners();
          document.body.classList.remove("vp-section-dragging");
          rec.el.classList.remove("is-dragging");
          clearDropHighlights();
          hidePlaceholder(rec);
        }

        function finish(finishEvent) {
          if (finishEvent.pointerId !== pointerId) return;
          if (!started) {
            removeListeners();
            if (finishEvent.type === "pointerup") {
              openDockMenu(rec, finishEvent.clientX, finishEvent.clientY);
            }
            return;
          }
          lastX = finishEvent.clientX;
          lastY = finishEvent.clientY;
          if (frame) {
            cancelAnimationFrame(frame);
            frame = null;
          }
          applyMove();
          updateFooterVisibility();
          geometry = measureSlots();
          dropSlot = findDropSlot(lastX, lastY, geometry);
          cleanup();
          if (dropSlot) {
            dockToSlot(rec, dropSlot);
            return;
          }
          var pos = clampPoint(startLeft + tx, startTop + ty, dragWidth, dragHeight);
          rec.el.style.left = pos.left + "px";
          rec.el.style.top = pos.top + "px";
          rec.el.style.transform = "none";
          rec.el.classList.remove("vp-section-docked-slot", "is-dragging");
          rec.el.classList.add("vp-section-floating");
          rec.mode = "float";
          rec.slot = null;
          ensurePlaceholder(rec, false);
          updateFooterVisibility();
          setGripTitle(rec);
          saveLayout();
        }

        function cancel() {
          removeListeners();
          document.body.classList.remove("vp-section-dragging");
          rec.el.classList.remove("is-dragging");
          clearDropHighlights();
          if (!started) return;
          if (originMode === "slot" && originSlot && originSlot !== "properties") {
            dockToSlot(rec, originSlot);
          } else if (originMode === "float") {
            floatSection(rec, startLeft, startTop, dragWidth, dragHeight);
          } else {
            dockToSlot(rec, "properties");
          }
        }

        function onKeyDown(keyEvent) {
          if (keyEvent.key === "Escape") {
            keyEvent.preventDefault();
            cancel();
          }
        }

        window.addEventListener("pointermove", onMove, true);
        window.addEventListener("pointerup", finish, true);
        window.addEventListener("pointercancel", cancel, true);
        window.addEventListener("keydown", onKeyDown, true);
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
        floatSection(rec, state.left, state.top, state.width, state.height, true);
      } else if (state.mode === "slot" && state.slot && state.slot !== "properties" && slots[state.slot]) {
        dockToSlot(rec, state.slot, false);
      } else if (state.mode === "home" || state.slot === "properties") {
        // already home
      } else if (typeof state.mode === "string" && state.mode.indexOf("dock-") === 0) {
        // migrate old canvas-dock layouts to free float
        floatSection(rec, state.left, state.top, state.width || 280, state.height || 0, true);
      }
    });
    updateFooterVisibility();
    restoring = false;
    saveLayout();
    var resetButton = document.getElementById("panel-layout-reset");
    if (resetButton) {
      resetButton.addEventListener("click", function () {
        records.forEach(function (rec) {
          dockToSlot(rec, "properties", false);
        });
        try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}
        updateFooterVisibility();
      });
    }

    document.addEventListener("pointerdown", function (event) {
      if (dockMenu && !dockMenu.contains(event.target)) closeDockMenu();
    }, true);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeDockMenu();
    }, true);
    window.addEventListener("blur", closeDockMenu);
    window.addEventListener("resize", function () {
      closeDockMenu();
      records.forEach(function (rec) {
        if (rec.mode !== "float") return;
        var rect = rec.el.getBoundingClientRect();
        var pos = clampPoint(rect.left, rect.top, rect.width, rect.height);
        rec.el.style.left = pos.left + "px";
        rec.el.style.top = pos.top + "px";
      });
    });
    window.addEventListener("scroll", closeDockMenu, true);

    [120, 360, 900].forEach(function (delay) {
      setTimeout(function () {
        collectSections();
        updateFooterVisibility();
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
