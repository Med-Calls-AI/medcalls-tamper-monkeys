// ==UserScript==
// @name         Retell: Wide Components Sidebar
// @namespace    http://tampermonkey.net/
// @version      2026-02-08
// @description  Force the components sidebar to w-[400px] and fix truncation/scrolling
// @author       You
// @match        https://dashboard.retellai.com/agents*
// @icon         https://dashboard.retellai.com/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Fixes:
   * 1. Sidebar width control (slider + collapse).
   * 2. Row/content untruncate.
   * 3. Right-edge button visibility (row/header padding).
   * 4. Horizontal overflow suppression on sidebar parent.
   * 5. Hardened targeting to avoid touching unrelated UI.
   */

  const CONSTANTS = {
    DEFAULT_WIDTH: 400,
    MIN_WIDTH: 220,
    MAX_WIDTH: 1000,
    COLLAPSED_WIDTH: 50,
    RIGHT_PADDING_CLASS: "pr-1", // 4px
    NAME_RENDER_MODE: "wrap", // "wrap" | "scroll"
    STORAGE_KEY: "tm-retell-sidebar-config",
    CONTROLS_ID: "tm-retell-controls",
    SIDEBAR_MARKER_CLASS: "tm-retell-sidebar-target",
    STYLE_ID: "tm-retell-components-sidebar-fixes",
  };

  const state = {
    sidebar: null,
  };

  const config = {
    width: CONSTANTS.DEFAULT_WIDTH,
    collapsed: false,
  };

  loadConfig();
  injectStyles();

  function loadConfig() {
    try {
      const saved = localStorage.getItem(CONSTANTS.STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (typeof parsed.width === "number") {
        config.width = clampWidth(parsed.width);
      }
      if (typeof parsed.collapsed === "boolean") {
        config.collapsed = parsed.collapsed;
      }
    } catch (e) {
      // Ignore malformed local state.
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      // Ignore storage failures.
    }
  }

  function clampWidth(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return CONSTANTS.DEFAULT_WIDTH;
    return Math.min(CONSTANTS.MAX_WIDTH, Math.max(CONSTANTS.MIN_WIDTH, Math.round(n)));
  }

  function injectStyles() {
    if (document.getElementById(CONSTANTS.STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = CONSTANTS.STYLE_ID;
    style.textContent = `
      .tm-retell-row .tm-retell-name {
        text-overflow: clip !important;
        overflow: visible !important;
      }

      .tm-retell-row.tm-retell-wrap .tm-retell-name {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        line-height: 1.15 !important;
      }

      .tm-retell-row.tm-retell-scroll .tm-retell-name {
        white-space: nowrap !important;
        overflow: auto !important;
      }

      .tm-retell-row {
        min-width: 0 !important;
        width: 100% !important;
      }

      .tm-retell-row .tm-retell-grow {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        width: auto !important;
      }

      .tm-retell-row .tm-retell-right {
        flex: 0 0 auto !important;
        margin-left: 8px !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function applyAll() {
    const sidebar = findSidebar();
    if (!sidebar) {
      setActiveSidebar(null);
      return;
    }

    setActiveSidebar(sidebar);
    setSidebarWidth(sidebar);
    injectControls(sidebar);
    applyHeaderPadding(sidebar);
    applyRowFixes(sidebar);

    if (sidebar.parentElement instanceof HTMLElement) {
      sidebar.parentElement.style.setProperty("overflow-x", "hidden", "important");
    }
  }

  function setActiveSidebar(nextSidebar) {
    if (state.sidebar === nextSidebar) return;

    if (state.sidebar instanceof HTMLElement) {
      state.sidebar.classList.remove(CONSTANTS.SIDEBAR_MARKER_CLASS);
    }
    state.sidebar = nextSidebar;
    if (state.sidebar instanceof HTMLElement) {
      state.sidebar.classList.add(CONSTANTS.SIDEBAR_MARKER_CLASS);
    }
  }

  function setSidebarWidth(sidebar) {
    if (!(sidebar instanceof HTMLElement)) return;

    const clamped = clampWidth(config.width);
    if (clamped !== config.width) {
      config.width = clamped;
      saveConfig();
    }

    const targetW = config.collapsed ? CONSTANTS.COLLAPSED_WIDTH : config.width;
    sidebar.style.width = `${targetW}px`;
    sidebar.style.maxWidth = `${targetW}px`;
    sidebar.style.flex = `0 0 ${targetW}px`;
  }

  function injectControls(sidebar) {
    if (!(sidebar instanceof HTMLElement)) return;

    const staleControls = Array.from(document.querySelectorAll(`#${CONSTANTS.CONTROLS_ID}`)).filter(
      (el) => !sidebar.contains(el)
    );
    staleControls.forEach((el) => el.remove());

    const tablist = findSidebarTablist(sidebar);
    if (!tablist) return;

    let container = sidebar.querySelector(`#${CONSTANTS.CONTROLS_ID}`);
    if (!container) {
      container = document.createElement("div");
      container.id = CONSTANTS.CONTROLS_ID;
      container.style.display = "flex";
      container.style.alignItems = "center";
      container.style.justifyContent = "space-between";
      container.style.padding = "4px 8px";
      container.style.borderBottom = "1px solid #eee";
      container.style.marginBottom = "8px";
      container.style.gap = "8px";

      const button = document.createElement("button");
      button.setAttribute("data-role", "collapse-toggle");
      button.style.padding = "2px 6px";
      button.style.cursor = "pointer";
      button.style.border = "1px solid #ccc";
      button.style.borderRadius = "4px";
      button.style.fontSize = "12px";
      button.addEventListener("click", () => {
        config.collapsed = !config.collapsed;
        saveConfig();
        applyAll();
      });

      const slider = document.createElement("input");
      slider.setAttribute("data-role", "width-slider");
      slider.type = "range";
      slider.min = String(CONSTANTS.MIN_WIDTH);
      slider.max = String(CONSTANTS.MAX_WIDTH);
      slider.style.flex = "1";
      slider.addEventListener("input", () => {
        config.width = clampWidth(slider.value);
        saveConfig();
        setSidebarWidth(sidebar);
      });

      container.appendChild(button);
      container.appendChild(slider);
      tablist.insertAdjacentElement("afterend", container);
    }

    syncControls(container);
  }

  function syncControls(container) {
    if (!(container instanceof HTMLElement)) return;

    const button = container.querySelector('button[data-role="collapse-toggle"]');
    const slider = container.querySelector('input[data-role="width-slider"]');
    if (button instanceof HTMLButtonElement) {
      button.textContent = config.collapsed ? ">>" : "<<";
    }
    if (slider instanceof HTMLInputElement) {
      slider.value = String(clampWidth(config.width));
      slider.style.display = config.collapsed ? "none" : "block";
    }
  }

  function applyHeaderPadding(sidebar) {
    const headers = Array.from(sidebar.querySelectorAll("button")).filter((button) => {
      const text = (button.innerText || "").toLowerCase();
      return text.includes("library components") || text.includes("agent components");
    });

    headers.forEach((header) => {
      if (!header.classList.contains(CONSTANTS.RIGHT_PADDING_CLASS)) {
        header.classList.add(CONSTANTS.RIGHT_PADDING_CLASS);
      }
    });
  }

  function applyRowFixes(sidebar) {
    const panel = findComponentsPanel(sidebar);
    if (!(panel instanceof HTMLElement)) return;

    const rows = Array.from(panel.querySelectorAll("div.group")).filter(looksLikeComponentRow);
    rows.forEach(applyRowFix);
  }

  function applyRowFix(row) {
    if (!(row instanceof HTMLElement)) return;

    row.classList.add("tm-retell-row");
    row.classList.add(CONSTANTS.RIGHT_PADDING_CLASS);
    row.classList.toggle("tm-retell-wrap", CONSTANTS.NAME_RENDER_MODE === "wrap");
    row.classList.toggle("tm-retell-scroll", CONSTANTS.NAME_RENDER_MODE === "scroll");
    row.style.display = "flex";
    row.style.width = "100%";
    row.style.minWidth = "0";

    const left = row.querySelector("div.inline-flex.items-center.gap-2");
    if (left instanceof HTMLElement) {
      left.classList.add("tm-retell-grow");
      left.style.flex = "1 1 auto";
      left.style.minWidth = "0";
      left.style.width = "auto";
    }

    const directChildren = Array.from(row.children).filter((child) => child instanceof HTMLElement);
    let right = null;
    for (let i = directChildren.length - 1; i >= 0; i -= 1) {
      const child = directChildren[i];
      if (child.querySelectorAll("button").length > 0) {
        right = child;
        break;
      }
    }
    if (right instanceof HTMLElement) {
      right.classList.add("tm-retell-right");
    }

    const renameInput = row.querySelector('input[type="text"]');
    if (renameInput instanceof HTMLElement) {
      renameInput.classList.add("tm-retell-name");
      renameInput.style.width = "100%";
      renameInput.style.flex = "1 1 auto";
      renameInput.style.minWidth = "0";
      untruncateElement(renameInput, "scroll");

      let parent = renameInput.parentElement;
      while (parent && parent !== row) {
        parent.classList.add("tm-retell-grow");
        parent.style.flex = "1 1 auto";
        parent.style.width = "auto";
        parent.style.minWidth = "0";
        parent.style.maxWidth = "none";
        parent = parent.parentElement;
      }
      return;
    }

    const scope = left instanceof HTMLElement ? left : row;
    const candidates = Array.from(scope.querySelectorAll("span, p, div"))
      .filter((node) => node instanceof HTMLElement)
      .filter((node) => (node.innerText || "").trim().length > 0);

    let best = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const cls = (candidate.className || "").toString();
      const styles = getComputedStyle(candidate);
      const score =
        (cls.includes("truncate") ? 50 : 0) +
        (cls.includes("overflow-hidden") ? 20 : 0) +
        (cls.includes("whitespace-nowrap") ? 10 : 0) +
        (styles.textOverflow === "ellipsis" ? 30 : 0) +
        Math.min(20, (candidate.innerText || "").length / 5);

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best instanceof HTMLElement) {
      best.classList.add("tm-retell-name");
      best.classList.add("tm-retell-grow");
      best.style.flex = "1 1 auto";
      best.style.minWidth = "0";
      best.style.width = "auto";
      untruncateElement(best, CONSTANTS.NAME_RENDER_MODE);
    }
  }

  function untruncateElement(element, mode) {
    if (!(element instanceof HTMLElement)) return;

    element.style.textOverflow = "clip";
    element.style.overflow = mode === "scroll" ? "auto" : "visible";
    element.style.whiteSpace = mode === "scroll" ? "nowrap" : "normal";
    element.style.minWidth = "0";
    element.style.maxWidth = "none";

    if (mode === "wrap") {
      element.style.overflowWrap = "anywhere";
      element.style.wordBreak = "break-word";
    }
  }

  function findSidebar() {
    const tablists = Array.from(document.querySelectorAll('[role="tablist"]')).filter(isSidebarTablist);

    for (const tablist of tablists) {
      const sidebar = findSidebarContainerFromTablist(tablist);
      if (sidebar) return sidebar;
    }

    // Fallback: if tablist labeling changes, try from components panels directly.
    const panels = Array.from(
      document.querySelectorAll(
        '[role="tabpanel"][id*="content-components"], [role="tabpanel"][aria-labelledby*="components"]'
      )
    );
    for (const panel of panels) {
      if (!(panel instanceof HTMLElement)) continue;
      let current = panel.parentElement;
      while (current && current !== document.body) {
        if (isSidebarContainer(current)) return current;
        current = current.parentElement;
      }
    }
    return null;
  }

  function findSidebarContainerFromTablist(tablist) {
    if (!(tablist instanceof HTMLElement)) return null;

    let fallback = null;
    let current = tablist.parentElement;
    while (current && current !== document.body) {
      if (isSidebarContainer(current)) {
        const cls = (current.className || "").toString().toLowerCase();
        const strongMatch =
          cls.includes("overflow-hidden") ||
          cls.includes("rounded") ||
          cls.includes("bg-bg-white-0") ||
          cls.includes("w-[") ||
          cls.includes("sidebar");

        if (strongMatch) return current;
        if (!fallback) fallback = current;
      }
      current = current.parentElement;
    }

    return fallback;
  }

  function isSidebarTablist(element) {
    if (!(element instanceof HTMLElement)) return false;
    const text = (element.innerText || "").toLowerCase();
    const hasComponents = text.includes("components");
    const hasNodeLike = text.includes("node");
    const tabCount = element.querySelectorAll('[role="tab"]').length;
    return hasComponents && (hasNodeLike || tabCount >= 2);
  }

  function isSidebarContainer(element) {
    if (!(element instanceof HTMLElement)) return false;

    const panel = findComponentsPanel(element);
    const tablist = findSidebarTablist(element);
    if (!panel || !tablist) return false;

    const rect = element.getBoundingClientRect();
    if (rect.height < 180) return false;
    if (rect.width <= 0 || rect.width > window.innerWidth * 0.95) return false;
    return true;
  }

  function findSidebarTablist(sidebar) {
    return sidebar.querySelector('[role="tablist"]');
  }

  function findComponentsPanel(scope) {
    if (!(scope instanceof HTMLElement)) return null;
    return scope.querySelector(
      '[role="tabpanel"][id*="content-components"], [role="tabpanel"][aria-labelledby*="components"]'
    );
  }

  function looksLikeComponentRow(element) {
    if (!(element instanceof HTMLElement)) return false;

    const cls = (element.className || "").toString();
    const hasGroup = cls.includes("group");
    const hasH9 = cls.includes("h-9");
    const hasJustifyBetween = cls.includes("justify-between");
    const hasItemsCenter = cls.includes("items-center");
    if (!(hasGroup && hasH9 && hasJustifyBetween && hasItemsCenter)) return false;

    const hasRenameInput = !!element.querySelector('input[type="text"]');
    const hasButtons = element.querySelectorAll("button").length >= 1;
    return hasRenameInput || hasButtons;
  }

  let rafScheduled = false;
  function scheduleApply() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      applyAll();
    });
  }

  function mutationTouchesTargetArea(mutations) {
    const hasLiveSidebar =
      state.sidebar instanceof HTMLElement && document.documentElement.contains(state.sidebar);

    // No target yet: keep retrying when DOM structure changes.
    if (!hasLiveSidebar) {
      return mutations.some((mutation) => mutation.type === "childList");
    }

    for (const mutation of mutations) {
      const target = mutation.target;
      if (!(target instanceof HTMLElement)) continue;

      if (state.sidebar.contains(target)) return true;

      if (target.matches('[role="tablist"]') || target.querySelector('[role="tablist"]')) {
        return true;
      }
    }
    return false;
  }

  function startObservers() {
    const mo = new MutationObserver((mutations) => {
      if (mutationTouchesTargetArea(mutations)) {
        scheduleApply();
      }
    });

    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-state", "aria-expanded", "hidden"],
    });

    window.addEventListener("resize", scheduleApply, { passive: true });
    window.addEventListener("load", scheduleApply, { once: true });
  }

  startObservers();
  scheduleApply();
})();
