// ==UserScript==
// @name         Airtable: Expanded Multiline Cell Size/Position
// @namespace    http://tampermonkey.net/
// @version      2026-02-19.8
// @description  Make expanded multiline/lookup text cells open larger with a default top-left position and size sliders.
// @author       You
// @match        https://airtable.com/*
// @match        https://*.airtable.com/*
// @icon         https://airtable.com/favicon.ico
// @downloadURL  https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/airtable/expanded_multiline_cell.js
// @updateURL    https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/airtable/expanded_multiline_cell.js
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const CONSTANTS = {
        DIALOG_SELECTOR: [
            '.cell.expanded.shadow-elevation-high[role="dialog"][data-columntype="multilineText"]',
            '.cell.expanded.shadow-elevation-high[role="dialog"][data-columntype="lookup"][data-formatting="text"]',
        ].join(", "),
        STYLE_ID: "tm-airtable-expanded-multiline-layout",
        INIT_FLAG: "tmAirtableDefaultPosApplied",
        UNLOCK_FLAG: "tmAirtablePositionUnlocked",
        DRAG_LISTENER_FLAG: "tmAirtableDragListenerBound",
        DRAG_ACTIVE_FLAG: "tmAirtableDragActive",
        STABILIZE_FLAG: "tmAirtableStabilizeQueued",
        STORAGE_KEY: "tm-airtable-expanded-multiline-size",
        CONTROLS_CLASS: "tm-airtable-size-controls",
        TOGGLE_CLASS: "tm-airtable-size-toggle",
        WIDTH_MIN: 20,
        WIDTH_MAX: 100,
        HEIGHT_MIN: 30,
        HEIGHT_MAX: 100,
        DEFAULT_WIDTH_VW: 50,
        DEFAULT_HEIGHT_VH: 80,
        DEFAULT_CONTROLS_VISIBLE: true,
    };

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function asInt(value, fallback) {
        const parsed = parseInt(String(value), 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function loadSizeConfig() {
        const fallback = {
            widthVw: CONSTANTS.DEFAULT_WIDTH_VW,
            heightVh: CONSTANTS.DEFAULT_HEIGHT_VH,
            controlsVisible: CONSTANTS.DEFAULT_CONTROLS_VISIBLE,
        };

        try {
            const raw = localStorage.getItem(CONSTANTS.STORAGE_KEY);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return {
                widthVw: clamp(asInt(parsed.widthVw, fallback.widthVw), CONSTANTS.WIDTH_MIN, CONSTANTS.WIDTH_MAX),
                heightVh: clamp(asInt(parsed.heightVh, fallback.heightVh), CONSTANTS.HEIGHT_MIN, CONSTANTS.HEIGHT_MAX),
                controlsVisible: typeof parsed.controlsVisible === "boolean" ? parsed.controlsVisible : fallback.controlsVisible,
            };
        } catch {
            return fallback;
        }
    }

    function saveSizeConfig(config) {
        try {
            localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(config));
        } catch {
            // Ignore storage failures.
        }
    }

    const config = loadSizeConfig();
    let sessionPosition = null;
    let activeDragDialog = null;
    let globalDragEndListenersBound = false;

    function widthValue() {
        return `${config.widthVw}vw`;
    }

    function heightValue() {
        return `${config.heightVh}vh`;
    }

    function makeSliderGroup(labelText, min, max, initialValue) {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.flexDirection = "column";
        wrap.style.flex = "1 1 0";
        wrap.style.minWidth = "0";
        wrap.style.padding = "0 2px";

        const label = document.createElement("div");
        label.style.fontSize = "11px";
        label.style.lineHeight = "1.2";
        label.style.color = "var(--text-color-quieter, #8c8c8c)";
        label.style.marginBottom = "2px";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = String(min);
        slider.max = String(max);
        slider.step = "1";
        slider.value = String(initialValue);
        slider.style.width = "100%";

        const updateLabel = (value) => {
            label.textContent = `${labelText}: ${value}${labelText === "Width" ? "vw" : "vh"}`;
        };
        updateLabel(initialValue);

        wrap.appendChild(label);
        wrap.appendChild(slider);

        return { wrap, slider, updateLabel };
    }

    function eyeSvg(visible) {
        if (visible) {
            return '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M1.2 10c1.5-3.4 4.8-5.6 8.8-5.6s7.3 2.2 8.8 5.6c-1.5 3.4-4.8 5.6-8.8 5.6S2.7 13.4 1.2 10z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
        }

        return '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M1.2 10c1.5-3.4 4.8-5.6 8.8-5.6 2 0 3.9.6 5.4 1.7M18.8 10c-1.5 3.4-4.8 5.6-8.8 5.6-2 0-3.9-.6-5.4-1.7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.2 3.2l13.6 13.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    }

    function syncToggleButton(button) {
        if (!(button instanceof HTMLButtonElement)) return;
        const state = config.controlsVisible ? "1" : "0";
        if (button.dataset.tmVisibleState === state) return;
        button.innerHTML = eyeSvg(config.controlsVisible);
        button.title = config.controlsVisible ? "Hide size sliders" : "Show size sliders";
        button.setAttribute("aria-label", config.controlsVisible ? "Hide size sliders" : "Show size sliders");
        button.dataset.tmVisibleState = state;
    }

    function injectSizeControls(dialog) {
        if (!(dialog instanceof HTMLElement)) return;

        const frame = dialog.querySelector(":scope > .p2-and-half.relative.z4");
        if (!(frame instanceof HTMLElement)) return;

        const labelRow = frame.querySelector(":scope > .flex.items-center.text-color-quieter.mb1");
        if (!(labelRow instanceof HTMLElement)) return;

        let controls = frame.querySelector(`:scope > .${CONSTANTS.CONTROLS_CLASS}`);
        if (controls instanceof HTMLElement) {
            const widthSlider = controls.querySelector('input[data-size-axis="width"]');
            const heightSlider = controls.querySelector('input[data-size-axis="height"]');
            const widthValueLabel = controls.querySelector('[data-size-value="width"]');
            const heightValueLabel = controls.querySelector('[data-size-value="height"]');
            if (widthSlider instanceof HTMLInputElement) widthSlider.value = String(config.widthVw);
            if (heightSlider instanceof HTMLInputElement) heightSlider.value = String(config.heightVh);
            if (widthValueLabel instanceof HTMLElement) widthValueLabel.textContent = `Width: ${config.widthVw}vw`;
            if (heightValueLabel instanceof HTMLElement) heightValueLabel.textContent = `Height: ${config.heightVh}vh`;
        } else {
            controls = document.createElement("div");
            controls.className = CONSTANTS.CONTROLS_CLASS;
            controls.style.display = "flex";
            controls.style.gap = "10px";
            controls.style.marginBottom = "8px";
            controls.style.alignItems = "stretch";
            controls.style.width = "100%";
            controls.style.boxSizing = "border-box";
            controls.style.paddingLeft = "16px";

            const widthGroup = makeSliderGroup("Width", CONSTANTS.WIDTH_MIN, CONSTANTS.WIDTH_MAX, config.widthVw);
            const heightGroup = makeSliderGroup("Height", CONSTANTS.HEIGHT_MIN, CONSTANTS.HEIGHT_MAX, config.heightVh);
            widthGroup.slider.dataset.sizeAxis = "width";
            heightGroup.slider.dataset.sizeAxis = "height";
            widthGroup.wrap.firstElementChild.dataset.sizeValue = "width";
            heightGroup.wrap.firstElementChild.dataset.sizeValue = "height";

            widthGroup.slider.addEventListener("input", () => {
                config.widthVw = clamp(asInt(widthGroup.slider.value, config.widthVw), CONSTANTS.WIDTH_MIN, CONSTANTS.WIDTH_MAX);
                widthGroup.updateLabel(config.widthVw);
                saveSizeConfig(config);
                applyAll();
            });

            heightGroup.slider.addEventListener("input", () => {
                config.heightVh = clamp(asInt(heightGroup.slider.value, config.heightVh), CONSTANTS.HEIGHT_MIN, CONSTANTS.HEIGHT_MAX);
                heightGroup.updateLabel(config.heightVh);
                saveSizeConfig(config);
                applyAll();
            });

            controls.appendChild(widthGroup.wrap);
            controls.appendChild(heightGroup.wrap);
            labelRow.insertAdjacentElement("afterend", controls);
        }

        let toggle = frame.querySelector(`:scope > .${CONSTANTS.TOGGLE_CLASS}`);
        if (!(toggle instanceof HTMLButtonElement)) {
            toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = CONSTANTS.TOGGLE_CLASS;
            toggle.style.position = "absolute";
            toggle.style.left = "0px";
            toggle.style.width = "18px";
            toggle.style.height = "18px";
            toggle.style.padding = "0";
            toggle.style.margin = "0";
            toggle.style.border = "1px solid rgba(0,0,0,0.2)";
            toggle.style.borderRadius = "9px";
            toggle.style.background = "rgba(255,255,255,0.92)";
            toggle.style.color = "#666";
            toggle.style.cursor = "pointer";
            toggle.style.pointerEvents = "auto";
            toggle.style.display = "flex";
            toggle.style.alignItems = "center";
            toggle.style.justifyContent = "center";
            toggle.style.lineHeight = "1";
            toggle.style.boxShadow = "0 1px 3px rgba(0,0,0,0.18)";
            toggle.style.zIndex = "1000";

            const stop = (event) => {
                event.stopPropagation();
            };
            toggle.addEventListener("pointerdown", stop);
            toggle.addEventListener("mousedown", stop);
            toggle.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                config.controlsVisible = !config.controlsVisible;
                saveSizeConfig(config);
                applyAll();
            });

            frame.appendChild(toggle);
        }

        controls.style.display = config.controlsVisible ? "flex" : "none";
        controls.style.marginBottom = config.controlsVisible ? "8px" : "0px";

        const visibleTop = controls.offsetTop + Math.max(0, Math.round((controls.offsetHeight - 18) / 2));
        const hiddenTop = labelRow.offsetTop + labelRow.offsetHeight + 2;
        toggle.style.top = `${Math.max(0, config.controlsVisible ? visibleTop : hiddenTop)}px`;
        syncToggleButton(toggle);
    }

    // ---------- CSS injection ----------
    function injectStyles() {
        if (document.getElementById(CONSTANTS.STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = CONSTANTS.STYLE_ID;
        style.textContent = `
      ${CONSTANTS.DIALOG_SELECTOR} {
        box-sizing: border-box !important;
        min-width: 0 !important;
      }

      ${CONSTANTS.DIALOG_SELECTOR} .${CONSTANTS.CONTROLS_CLASS} input[type="range"] {
        margin: 0 !important;
      }

      ${CONSTANTS.DIALOG_SELECTOR} .${CONSTANTS.TOGGLE_CLASS}:hover {
        background: rgba(255,255,255,1) !important;
      }
    `;

        document.documentElement.appendChild(style);
    }

    function forceStyles(el, styles) {
        if (!(el instanceof HTMLElement)) return;
        for (const [k, v] of Object.entries(styles)) {
            el.style.setProperty(k, v, "important");
        }
    }

    function parsePx(value) {
        const parsed = parseFloat(String(value || ""));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function readDialogPosition(dialog) {
        if (!(dialog instanceof HTMLElement)) return null;
        const top = parsePx(dialog.style.top);
        const left = parsePx(dialog.style.left);
        if (top === null || left === null) return null;
        return { top, left };
    }

    function clampPositionToViewport(position, dialog) {
        const rect = dialog.getBoundingClientRect();
        const dialogWidth = rect.width || (window.innerWidth * config.widthVw) / 100;
        const dialogHeight = rect.height || (window.innerHeight * config.heightVh) / 100;
        const maxLeft = Math.max(0, window.innerWidth - dialogWidth);
        const maxTop = Math.max(0, window.innerHeight - dialogHeight);
        return {
            top: clamp(position.top, 0, maxTop),
            left: clamp(position.left, 0, maxLeft),
        };
    }

    function rememberDialogPosition(dialog) {
        const position = readDialogPosition(dialog);
        if (!position) return;
        sessionPosition = clampPositionToViewport(position, dialog);
    }

    function desiredPosition(dialog) {
        if (sessionPosition) return clampPositionToViewport(sessionPosition, dialog);
        return { top: 0, left: 0 };
    }

    function almostEqual(a, b) {
        return Math.abs(a - b) < 0.75;
    }

    function dialogNeedsPosition(dialog) {
        if (!(dialog instanceof HTMLElement)) return false;
        if (dialog.dataset[CONSTANTS.DRAG_ACTIVE_FLAG] === "1") return false;
        const current = readDialogPosition(dialog);
        const desired = desiredPosition(dialog);
        if (!current) return true;
        return !almostEqual(current.top, desired.top) || !almostEqual(current.left, desired.left);
    }

    function handleGlobalDragEnd() {
        if (!(activeDragDialog instanceof HTMLElement)) return;
        activeDragDialog.dataset[CONSTANTS.DRAG_ACTIVE_FLAG] = "0";
        rememberDialogPosition(activeDragDialog);
        activeDragDialog = null;
        scheduleApply();
    }

    function ensureGlobalDragEndListeners() {
        if (globalDragEndListenersBound) return;
        window.addEventListener("pointerup", handleGlobalDragEnd, { passive: true });
        window.addEventListener("mouseup", handleGlobalDragEnd, { passive: true });
        window.addEventListener("blur", handleGlobalDragEnd);
        globalDragEndListenersBound = true;
    }

    function bindDragUnlock(dialog) {
        if (!(dialog instanceof HTMLElement)) return;
        if (dialog.dataset[CONSTANTS.DRAG_LISTENER_FLAG]) return;
        ensureGlobalDragEndListeners();

        const dragHandle = dialog.querySelector(".expandedCellDragHandle.dragHandle");
        if (!(dragHandle instanceof HTMLElement)) return;

        const unlock = () => {
            dialog.dataset[CONSTANTS.UNLOCK_FLAG] = "1";
            dialog.dataset[CONSTANTS.DRAG_ACTIVE_FLAG] = "1";
            activeDragDialog = dialog;
        };

        dragHandle.addEventListener("pointerdown", unlock, { passive: true });
        dragHandle.addEventListener("mousedown", unlock, { passive: true });
        dialog.dataset[CONSTANTS.DRAG_LISTENER_FLAG] = "1";
    }

    function queueInitialStabilization(dialog) {
        if (!(dialog instanceof HTMLElement)) return;
        if (dialog.dataset[CONSTANTS.STABILIZE_FLAG]) return;

        dialog.dataset[CONSTANTS.STABILIZE_FLAG] = "1";
        const delays = [0, 40, 120, 260];
        for (const delay of delays) {
            window.setTimeout(() => {
                if (!dialog.isConnected) return;
                requestAnimationFrame(() => {
                    if (!dialog.isConnected) return;
                    applyDialogLayout(dialog);
                });
            }, delay);
        }
    }

    // Size is enforced continuously; position defaults to 0,0 until dragged, then uses session memory.
    function applyDialogLayout(dialog) {
        if (!(dialog instanceof HTMLElement)) return;

        queueInitialStabilization(dialog);
        bindDragUnlock(dialog);

        if (dialog.dataset[CONSTANTS.DRAG_ACTIVE_FLAG] !== "1") {
            const position = desiredPosition(dialog);
            dialog.style.top = `${position.top}px`;
            dialog.style.left = `${position.left}px`;
            dialog.dataset[CONSTANTS.INIT_FLAG] = "1";
        }

        dialog.style.setProperty("width", widthValue(), "important");
        dialog.style.setProperty("max-width", widthValue(), "important");
        dialog.style.setProperty("height", heightValue(), "important");
        dialog.style.setProperty("max-height", heightValue(), "important");
        dialog.style.setProperty("min-height", heightValue(), "important");

        const frame = dialog.querySelector(":scope > .p2-and-half.relative.z4");
        forceStyles(frame, {
            display: "flex",
            "flex-direction": "column",
            height: "100%",
            "min-height": "0",
            "min-width": "0",
            "box-sizing": "border-box",
            overflow: "hidden",
        });

        const editor = frame?.querySelector(':scope > [data-testid="cell-editor"]');
        forceStyles(editor, {
            display: "flex",
            "flex-direction": "column",
            flex: "1 1 auto",
            "min-height": "0",
            "min-width": "0",
            "box-sizing": "border-box",
            overflow: "hidden",
        });

        const baymax = editor?.querySelector(":scope > .flex-auto.flex.baymax");
        forceStyles(baymax, {
            display: "flex",
            "flex-direction": "column",
            flex: "1 1 auto",
            "min-height": "0",
            "min-width": "0",
            "box-sizing": "border-box",
            overflow: "hidden",
        });

        const column = baymax?.querySelector(":scope > .flex.flex-auto.flex-column");
        forceStyles(column, {
            display: "flex",
            "flex-direction": "column",
            flex: "1 1 auto",
            "min-height": "0",
            "min-width": "0",
            "box-sizing": "border-box",
            overflow: "hidden",
        });

        const textboxContainer = column?.querySelector(":scope > .col-12.contentEditableTextboxContainer");
        forceStyles(textboxContainer, {
            display: "flex",
            "flex-direction": "column",
            flex: "1 1 auto",
            "min-height": "0",
            "min-width": "0",
            "box-sizing": "border-box",
            overflow: "hidden",
        });

        const textbox = textboxContainer?.querySelector(":scope > .contentEditableTextbox");
        forceStyles(textbox, {
            flex: "1 1 auto",
            "min-height": "0",
            "min-width": "0",
            "box-sizing": "border-box",
            height: "100%",
            "max-height": "none",
            overflow: "auto",
            "overflow-wrap": "anywhere",
            "word-break": "break-word",
        });

        const lookupValue = baymax?.querySelector(":scope > .multiValue");
        forceStyles(lookupValue, {
            display: "flex",
            "flex-direction": "column",
            flex: "1 1 auto",
            "min-height": "0",
            "min-width": "0",
            "box-sizing": "border-box",
            height: "100%",
            "max-height": "none",
            overflow: "auto",
        });

        const lookupValueContent = lookupValue?.querySelector(":scope > .line-height-4");
        forceStyles(lookupValueContent, {
            "min-width": "0",
            "overflow-wrap": "anywhere",
            "word-break": "break-word",
            "white-space": "pre-wrap",
        });

        const closeButton = dialog.querySelector('.close [aria-label="Close expanded cell"], .close [role="button"]');
        forceStyles(closeButton, {
            top: "6px",
            right: "6px",
        });

        injectSizeControls(dialog);
    }

    function applyAll() {
        const dialogs = document.querySelectorAll(CONSTANTS.DIALOG_SELECTOR);
        dialogs.forEach(applyDialogLayout);
    }

    function isDialogOrInside(node) {
        if (!(node instanceof Element)) return false;
        return node.matches(CONSTANTS.DIALOG_SELECTOR) || !!node.closest(CONSTANTS.DIALOG_SELECTOR);
    }

    function containsDialog(node) {
        if (!(node instanceof Element)) return false;
        return !!node.querySelector(CONSTANTS.DIALOG_SELECTOR);
    }

    function isDialog(node) {
        return node instanceof Element && node.matches(CONSTANTS.DIALOG_SELECTOR);
    }

    // ---------- Mutation observer with rAF debounce ----------
    let rafScheduled = false;
    function scheduleApply() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            applyAll();
        });
    }

    injectStyles();

    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === "childList" && (m.addedNodes?.length || m.removedNodes?.length)) {
                for (const node of m.addedNodes) {
                    if (isDialog(node) || containsDialog(node)) {
                        scheduleApply();
                        return;
                    }
                }

                for (const node of m.removedNodes) {
                    if (isDialog(node) || containsDialog(node)) {
                        scheduleApply();
                        return;
                    }
                }
            }

            if (m.type === "attributes") {
                const target = m.target;
                if (target instanceof HTMLElement && target.matches(CONSTANTS.DIALOG_SELECTOR)) {
                    if (target.dataset[CONSTANTS.DRAG_ACTIVE_FLAG] === "1") {
                        rememberDialogPosition(target);
                        continue;
                    }

                    const desiredWidth = widthValue();
                    const desiredHeight = heightValue();
                    const needsSize =
                        target.style.width !== desiredWidth ||
                        target.style.maxWidth !== desiredWidth ||
                        target.style.height !== desiredHeight ||
                        target.style.maxHeight !== desiredHeight ||
                        target.style.minHeight !== desiredHeight;
                    const needsPosition = dialogNeedsPosition(target);

                    if (needsSize || needsPosition) {
                        scheduleApply();
                        return;
                    }
                }
            }
        }
    });

    mo.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style"],
    });

    window.addEventListener("resize", scheduleApply, { passive: true });

    // Initial run
    scheduleApply();
})();
