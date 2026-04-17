// ==UserScript==
// @name         Airtable: Wide Filter Fields
// @namespace    http://tampermonkey.net/
// @version      2026-03-27.2
// @description  Expand Airtable filter popovers, prioritize field names, and add a draggable field/value splitter.
// @author       You
// @match        https://airtable.com/*
// @match        https://*.airtable.com/*
// @icon         https://airtable.com/favicon.ico
// @downloadURL  https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/airtable/wide_filter_fields.js
// @updateURL    https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/airtable/wide_filter_fields.js
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const CONSTANTS = {
        POPOVER_SELECTOR: '[data-testid="view-config-filter-popover"]',
        FILTER_ROW_SELECTOR: '[data-filterid].absolute.left-0.width-full',
        STYLE_ID: "tm-airtable-wide-filter-fields-style",
        POPOVER_WIDTH: "min(96vw, 1800px)",
        POPOVER_SIDE_MARGIN_PX: 8,
        PANEL_MAX_HEIGHT: "min(90vh, 1400px)",
        FILTERS_MAX_HEIGHT: "min(72vh, 1100px)",
        FIELD_GROUP_MIN_WIDTH_PX: 480,
        FIELD_SECTION_FLEX: "3 1 0",
        FIELD_SECTION_MIN_WIDTH_PX: 320,
        OPERATOR_SECTION_FLEX: "1.2 1 0",
        OPERATOR_SECTION_MIN_WIDTH_PX: 160,
        DEFAULT_FIELD_GROUP_RATIO: 0.78,
        DEFAULT_FIELD_GROUP_RATIO_EMPTY: 0.94,
        VALUE_AREA_MIN_WIDTH_PX: 136,
        VALUE_AREA_SELECT_MIN_WIDTH_PX: 220,
        VALUE_AREA_COMPLEX_MIN_WIDTH_PX: 336,
        EMPTY_VALUE_AREA_MIN_WIDTH_PX: 12,
        SPLITTER_CLASS: "tm-airtable-filter-splitter",
        ROOT_RESIZING_CLASS: "tm-airtable-filter-resizing",
        SPLITTER_HIT_WIDTH_PX: 12,
        SPLITTER_TITLE: "Drag to resize filter and value widths",
        ROW_MIN_HEIGHT_PX: 38,
        ROW_VERTICAL_GAP_PX: 4,
        MUTATION_ATTRIBUTE_FILTER: ["class", "style", "aria-expanded"],
    };

    let rafScheduled = false;
    const splitRatioByFilterId = new Map();
    let activeResize = null;
    let activeResizeRafId = 0;

    injectStyles();
    startObservers();
    scheduleApply();
    [150, 500, 1200].forEach((delay) => window.setTimeout(scheduleApply, delay));

    function injectStyles() {
        if (document.getElementById(CONSTANTS.STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = CONSTANTS.STYLE_ID;
        style.textContent = `
      ${CONSTANTS.POPOVER_SELECTOR},
      ${CONSTANTS.POPOVER_SELECTOR} * {
        box-sizing: border-box !important;
      }

      ${CONSTANTS.POPOVER_SELECTOR} .existingFilterContainer .truncate,
      ${CONSTANTS.POPOVER_SELECTOR} .existingFilterContainer input[type="text"] {
        text-overflow: clip !important;
      }

      ${CONSTANTS.POPOVER_SELECTOR} [data-testid="autocomplete-button"] {
        min-width: 0 !important;
      }

      html.${CONSTANTS.ROOT_RESIZING_CLASS},
      html.${CONSTANTS.ROOT_RESIZING_CLASS} * {
        cursor: col-resize !important;
        user-select: none !important;
      }

      ${CONSTANTS.POPOVER_SELECTOR} .${CONSTANTS.SPLITTER_CLASS} {
        position: relative !important;
        flex: 0 0 ${CONSTANTS.SPLITTER_HIT_WIDTH_PX}px !important;
        width: ${CONSTANTS.SPLITTER_HIT_WIDTH_PX}px !important;
        min-width: ${CONSTANTS.SPLITTER_HIT_WIDTH_PX}px !important;
        max-width: ${CONSTANTS.SPLITTER_HIT_WIDTH_PX}px !important;
        align-self: stretch !important;
        touch-action: none !important;
        user-select: none !important;
        cursor: col-resize !important;
        background: transparent !important;
      }

      ${CONSTANTS.POPOVER_SELECTOR} .${CONSTANTS.SPLITTER_CLASS}::before {
        content: "";
        position: absolute;
        top: 6px;
        bottom: 6px;
        left: 50%;
        width: 2px;
        border-radius: 999px;
        transform: translateX(-50%);
        background: rgba(127, 139, 151, 0.38);
        transition: background-color 120ms ease, width 120ms ease, box-shadow 120ms ease;
      }

      ${CONSTANTS.POPOVER_SELECTOR} .${CONSTANTS.SPLITTER_CLASS}:hover::before,
      ${CONSTANTS.POPOVER_SELECTOR} .${CONSTANTS.SPLITTER_CLASS}[data-active="1"]::before {
        width: 4px;
        background: rgba(41, 98, 255, 0.9);
        box-shadow: 0 0 0 4px rgba(41, 98, 255, 0.16);
      }
    `;

        document.documentElement.appendChild(style);
    }

    function applyAll() {
        const popovers = document.querySelectorAll(CONSTANTS.POPOVER_SELECTOR);
        popovers.forEach(applyPopoverLayout);
    }

    function applyPopoverLayout(popover) {
        if (!(popover instanceof HTMLElement)) return;

        forceStyles(popover, {
            width: CONSTANTS.POPOVER_WIDTH,
            "max-width": CONSTANTS.POPOVER_WIDTH,
        });
        positionPopover(popover);

        const wrapper = popover.querySelector(":scope > .xs-max-width-1-clamped");
        forceStyles(wrapper, {
            width: CONSTANTS.POPOVER_WIDTH,
            "max-width": CONSTANTS.POPOVER_WIDTH,
        });

        const panel = wrapper?.querySelector(":scope > .colors-background-raised-popover");
        forceStyles(panel, {
            width: "100%",
            "max-width": "none",
            "max-height": CONSTANTS.PANEL_MAX_HEIGHT,
        });

        const filterContainer = popover.querySelector(".existingFilterContainer");
        forceStyles(filterContainer, {
            "max-height": CONSTANTS.FILTERS_MAX_HEIGHT,
        });

        filterContainer?.querySelectorAll(".relative.text-dark").forEach(applyStageLayout);
        syncTitles(popover);
    }

    function applyStageLayout(stage) {
        if (!(stage instanceof HTMLElement)) return;

        forceStyles(stage, {
            width: "100%",
            "max-width": "none",
            "min-width": "0",
        });

        const rows = Array.from(stage.querySelectorAll(`:scope > ${CONSTANTS.FILTER_ROW_SELECTOR}`));
        rows.forEach(applyFilterRowLayout);
        restackStageRows(stage, rows);
    }

    function applyFilterRowLayout(row) {
        if (!(row instanceof HTMLElement)) return;

        forceStyles(row, {
            width: "100%",
            "max-width": "none",
            "min-width": "0",
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
        });

        const rowLayout = row.querySelector(":scope > .flex.height-full");
        forceStyles(rowLayout, {
            width: "100%",
            "min-width": "0",
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
            "align-items": "stretch",
        });

        const prefixArea = rowLayout?.querySelector(":scope > .flex.items-center.px1");
        const prefixLabel = prefixArea?.querySelector('[data-testid="filter-prefix-label"]');
        forceStyles(prefixArea, {
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
        });

        forceStyles(prefixLabel, {
            height: "auto",
            "min-height": "0",
        });

        const editorArea = rowLayout?.querySelector(":scope > .flex-auto.flex.items-center");
        forceStyles(editorArea, {
            flex: "1 1 auto",
            "min-width": "0",
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
            "align-items": "stretch",
        });

        const filterShell = editorArea?.querySelector(":scope > [data-filterid]");
        forceStyles(filterShell, {
            display: "flex",
            flex: "1 1 auto",
            width: "100%",
            "max-width": "none",
            "min-width": "0",
            height: "auto",
        });

        const conditionCard = filterShell?.querySelector(":scope > .flex.items-stretch.content-box.border.rounded.colors-border-default.colors-background-raised-control");
        forceStyles(conditionCard, {
            display: "flex",
            width: "100%",
            "max-width": "none",
            "min-width": "0",
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
            "align-items": "stretch",
        });

        const mainContent = conditionCard?.querySelector(":scope > .flex-auto.flex.items-stretch");
        forceStyles(mainContent, {
            display: "flex",
            flex: "1 1 auto",
            width: "auto",
            "max-width": "none",
            "min-width": "0",
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
            "align-items": "stretch",
        });

        const fieldAndOperator = mainContent?.querySelector(":scope > .flex-none.flex.items-stretch.col-12");
        forceStyles(fieldAndOperator, {
            display: "flex",
            flex: "0 0 auto",
            width: "auto",
            "max-width": "none",
            "min-width": `${CONSTANTS.FIELD_GROUP_MIN_WIDTH_PX}px`,
            height: "auto",
        });

        const sections = Array.from(fieldAndOperator?.querySelectorAll(":scope > .self-stretch.flex.items-stretch") || []);
        const fieldSection = sections[0];
        const operatorSection = sections[1];

        sections.forEach((section) => {
            forceStyles(section, {
                "max-width": "none",
                "min-width": "0",
                height: "auto",
            });
        });

        forceStyles(fieldSection, {
            flex: CONSTANTS.FIELD_SECTION_FLEX,
            "min-width": `${CONSTANTS.FIELD_SECTION_MIN_WIDTH_PX}px`,
        });
        styleSectionFrame(fieldSection);
        const fieldButton = fieldSection?.querySelector('[data-testid="autocomplete-button"]');
        applyAutocompleteButtonLayout(fieldButton, { wrap: true, multiline: false });

        forceStyles(operatorSection, {
            flex: CONSTANTS.OPERATOR_SECTION_FLEX,
            "min-width": `${CONSTANTS.OPERATOR_SECTION_MIN_WIDTH_PX}px`,
        });
        styleSectionFrame(operatorSection);
        applyAutocompleteButtonLayout(operatorSection?.querySelector('[data-testid="autocomplete-button"]'));

        const valueArea = mainContent?.querySelector(":scope > .flex-auto.self-stretch.flex.items-stretch");
        forceStyles(valueArea, {
            display: "flex",
            flex: "0 0 auto",
            width: "auto",
            "max-width": "none",
            "min-width": "0",
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
        });

        forceStyles(valueArea?.firstElementChild, {
            flex: "1 1 auto",
            width: "100%",
            "max-width": "none",
            "min-width": "0",
            height: "auto",
        });

        valueArea?.querySelectorAll('[data-testid="textInputWithDebounce"]').forEach((node) => {
            forceStyles(node, {
                flex: "1 1 auto",
                width: "auto",
                "max-width": "none",
                "min-width": "0",
                height: "auto",
            });
        });

        valueArea?.querySelectorAll(".modeSelect").forEach((node) => {
            forceStyles(node, {
                flex: "1 1 auto",
                width: "auto",
                "max-width": "none",
                "min-width": "220px",
            });
        });

        valueArea?.querySelectorAll(".numberOfDaysInput").forEach((node) => {
            forceStyles(node, {
                flex: "0 0 96px",
                width: "96px",
                "min-width": "72px",
            });
        });

        valueArea?.querySelectorAll("input").forEach((input) => {
            forceStyles(input, {
                width: "100%",
                "min-width": "0",
                "text-overflow": "clip",
            });
        });

        valueArea?.querySelectorAll(".truncate").forEach((node) => applyWideTextStyles(node));

        const hasResizableValueArea = valueArea instanceof HTMLElement;
        const hasValueContent = hasMeaningfulValueContent(valueArea);
        const splitter = syncResizeHandle(row, mainContent, valueArea, hasResizableValueArea);
        applySplitLayout(row, mainContent, fieldAndOperator, valueArea, splitter, hasResizableValueArea, hasValueContent);
        syncFieldWrapPresentation(prefixArea, prefixLabel, fieldButton);
    }

    function restackStageRows(stage, rows) {
        if (!(stage instanceof HTMLElement)) return;
        if (!rows.length) return;

        let nextTop = 0;
        for (const row of rows) {
            const height = measureRowHeight(row);
            forceStyles(row, {
                top: `${nextTop}px`,
                height: `${height}px`,
            });
            nextTop += height + CONSTANTS.ROW_VERTICAL_GAP_PX;
        }

        forceStyles(stage, {
            height: `${Math.max(CONSTANTS.ROW_MIN_HEIGHT_PX, nextTop - CONSTANTS.ROW_VERTICAL_GAP_PX)}px`,
        });
    }

    function measureRowHeight(row) {
        if (!(row instanceof HTMLElement)) return CONSTANTS.ROW_MIN_HEIGHT_PX;

        const rowLayout = row.querySelector(":scope > .flex.height-full");
        const editorArea = rowLayout?.querySelector(":scope > .flex-auto.flex.items-center");
        const filterShell = editorArea?.querySelector(":scope > [data-filterid]");
        const conditionCard = filterShell?.querySelector(
            ":scope > .flex.items-stretch.content-box.border.rounded.colors-border-default.colors-background-raised-control"
        );

        forceStyles(row, {
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
        });
        forceStyles(rowLayout, {
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
        });
        forceStyles(editorArea, {
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
        });
        forceStyles(conditionCard, {
            height: "auto",
            "min-height": `${CONSTANTS.ROW_MIN_HEIGHT_PX}px`,
        });

        return Math.max(
            CONSTANTS.ROW_MIN_HEIGHT_PX,
            Math.ceil(row.scrollHeight),
            Math.ceil(rowLayout?.scrollHeight || 0),
            Math.ceil(conditionCard?.scrollHeight || 0),
            Math.ceil(row.getBoundingClientRect().height)
        );
    }

    function positionPopover(popover) {
        if (!(popover instanceof HTMLElement)) return;

        const desiredWidth = Math.min(window.innerWidth * 0.96, 1800);
        const margin = CONSTANTS.POPOVER_SIDE_MARGIN_PX;
        const currentLeft = popover.getBoundingClientRect().left;
        const maxLeft = Math.max(margin, window.innerWidth - desiredWidth - margin);
        const nextLeft = clamp(currentLeft, margin, maxLeft);

        forceStyles(popover, {
            left: `${Math.round(nextLeft)}px`,
            right: "auto",
        });
    }

    function scheduleApply() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            applyAll();
        });
    }

    function startObservers() {
        if (!(document.documentElement instanceof HTMLElement)) return;

        // Airtable frequently recreates this popover, so keep reapplying layout tweaks.
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    for (const node of mutation.addedNodes) {
                        if (isPopoverOrInside(node) || containsPopover(node)) {
                            scheduleApply();
                            return;
                        }
                    }

                    for (const node of mutation.removedNodes) {
                        if (isPopoverOrInside(node) || containsPopover(node)) {
                            scheduleApply();
                            return;
                        }
                    }
                }

                if (mutation.type === "attributes" && isPopoverOrInside(mutation.target)) {
                    scheduleApply();
                    return;
                }
            }
        });

        observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: CONSTANTS.MUTATION_ATTRIBUTE_FILTER,
        });

        document.addEventListener("input", handleFormActivity, true);
        document.addEventListener("change", handleFormActivity, true);
        window.addEventListener("resize", scheduleApply, { passive: true });
    }

    function applySplitLayout(row, mainContent, fieldAndOperator, valueArea, splitter, hasResizableValueArea, hasValueContent) {
        if (!(row instanceof HTMLElement)) return;
        if (!(mainContent instanceof HTMLElement)) return;
        if (!(fieldAndOperator instanceof HTMLElement)) return;
        if (!(valueArea instanceof HTMLElement)) return;

        const totalWidth = getSplitTotalWidth(mainContent, hasResizableValueArea);
        if (totalWidth <= 0) return;

        const filterId = row.dataset.filterid || "";
        const splitRatio = getStoredSplitRatio(filterId, hasValueContent);
        const bounds = getSplitBounds(totalWidth, valueArea, hasValueContent);
        const fieldWidth = clamp(Math.round(totalWidth * splitRatio), bounds.minFieldWidth, bounds.maxFieldWidth);
        const valueWidth = Math.max(0, totalWidth - fieldWidth);

        forceStyles(mainContent, {
            gap: "0px",
            "min-width": "0",
        });

        forceStyles(fieldAndOperator, {
            flex: `0 0 ${fieldWidth}px`,
            width: `${fieldWidth}px`,
            "min-width": `${fieldWidth}px`,
            "max-width": `${fieldWidth}px`,
        });

        if (splitter instanceof HTMLElement) {
            forceStyles(splitter, {
                display: hasResizableValueArea ? "flex" : "none",
                flex: hasResizableValueArea ? `0 0 ${CONSTANTS.SPLITTER_HIT_WIDTH_PX}px` : "0 0 0px",
                width: hasResizableValueArea ? `${CONSTANTS.SPLITTER_HIT_WIDTH_PX}px` : "0px",
                "min-width": hasResizableValueArea ? `${CONSTANTS.SPLITTER_HIT_WIDTH_PX}px` : "0px",
                "max-width": hasResizableValueArea ? `${CONSTANTS.SPLITTER_HIT_WIDTH_PX}px` : "0px",
            });
        }

        forceStyles(valueArea, {
            flex: `0 0 ${valueWidth}px`,
            width: `${valueWidth}px`,
            "min-width": `${valueWidth}px`,
            "max-width": `${valueWidth}px`,
        });
    }

    function startResizeDrag(event) {
        if (event.button !== 0) return;
        if (activeResize) {
            stopResizeDrag(undefined, { skipUpdate: true });
        }

        const splitter = event.currentTarget;
        if (!(splitter instanceof HTMLElement)) return;

        const row = splitter.closest(CONSTANTS.FILTER_ROW_SELECTOR);
        const stage = row?.closest(".relative.text-dark");
        const mainContent = splitter.parentElement;
        const fieldAndOperator = splitter.previousElementSibling;
        const valueArea = splitter.nextElementSibling;

        if (!(row instanceof HTMLElement)) return;
        if (!(stage instanceof HTMLElement)) return;
        if (!(mainContent instanceof HTMLElement)) return;
        if (!(fieldAndOperator instanceof HTMLElement)) return;
        if (!(valueArea instanceof HTMLElement)) return;

        const fieldRect = fieldAndOperator.getBoundingClientRect();
        const mainRect = mainContent.getBoundingClientRect();

        activeResize = {
            filterId: row.dataset.filterid || "",
            pointerId: event.pointerId,
            pointerOffsetPx: event.clientX - (mainRect.left + fieldRect.width),
            pendingClientX: event.clientX,
            row,
            splitter,
            stage,
        };

        splitter.dataset.active = "1";
        splitter.setPointerCapture?.(event.pointerId);
        setResizeMode(true);

        window.addEventListener("pointermove", handleResizeDragMove, true);
        window.addEventListener("pointerup", stopResizeDrag, true);
        window.addEventListener("pointercancel", stopResizeDrag, true);
        window.addEventListener("blur", stopResizeDrag, true);

        event.preventDefault();
        event.stopPropagation();
    }

    function handleResizeDragMove(event) {
        if (!activeResize) return;
        if (event.pointerId !== activeResize.pointerId) return;

        activeResize.pendingClientX = event.clientX;
        if (activeResizeRafId) return;

        activeResizeRafId = window.requestAnimationFrame(() => {
            activeResizeRafId = 0;
            updateActiveResize();
        });

        event.preventDefault();
    }

    function stopResizeDrag(event, options = {}) {
        if (!activeResize) return;
        if (event instanceof PointerEvent && event.type !== "blur" && event.pointerId !== activeResize.pointerId) return;

        if (activeResizeRafId) {
            window.cancelAnimationFrame(activeResizeRafId);
            activeResizeRafId = 0;
        }

        if (options.skipUpdate !== true && activeResize.row instanceof HTMLElement && activeResize.row.isConnected) {
            updateActiveResize();
        }

        activeResize.splitter?.releasePointerCapture?.(activeResize.pointerId);
        if (activeResize.splitter instanceof HTMLElement) {
            activeResize.splitter.dataset.active = "0";
        }

        activeResize = null;
        setResizeMode(false);

        window.removeEventListener("pointermove", handleResizeDragMove, true);
        window.removeEventListener("pointerup", stopResizeDrag, true);
        window.removeEventListener("pointercancel", stopResizeDrag, true);
        window.removeEventListener("blur", stopResizeDrag, true);
    }

    function updateActiveResize() {
        if (!activeResize) return;
        if (!(activeResize.row instanceof HTMLElement) || !activeResize.row.isConnected) {
            stopResizeDrag(undefined, { skipUpdate: true });
            return;
        }

        const row = activeResize.row;
        const stage = activeResize.stage;
        const mainContent = row.querySelector(":scope .flex-auto.flex.items-stretch");
        const splitter = mainContent?.querySelector(`:scope > .${CONSTANTS.SPLITTER_CLASS}`);

        if (!(stage instanceof HTMLElement)) return;
        if (!(mainContent instanceof HTMLElement)) return;
        if (!(splitter instanceof HTMLElement)) return;
        const valueArea = mainContent.querySelector(":scope > .flex-auto.self-stretch.flex.items-stretch");
        if (!(valueArea instanceof HTMLElement)) return;

        const hasValueContent = hasMeaningfulValueContent(valueArea);
        const totalWidth = getSplitTotalWidth(mainContent, true);
        if (totalWidth <= 0) return;

        const bounds = getSplitBounds(totalWidth, valueArea, hasValueContent);
        const boundaryX = activeResize.pendingClientX - activeResize.pointerOffsetPx - mainContent.getBoundingClientRect().left;
        const fieldWidth = clamp(Math.round(boundaryX), bounds.minFieldWidth, bounds.maxFieldWidth);

        if (activeResize.filterId) {
            splitRatioByFilterId.set(activeResize.filterId, fieldWidth / totalWidth);
        }

        applyFilterRowLayout(row);
        const rows = Array.from(stage.querySelectorAll(`:scope > ${CONSTANTS.FILTER_ROW_SELECTOR}`));
        restackStageRows(stage, rows);
    }

    function syncFieldWrapPresentation(prefixArea, prefixLabel, fieldButton) {
        const multiline = isButtonLabelWrapped(fieldButton);

        forceStyles(prefixArea, {
            "align-items": multiline ? "flex-start" : "center",
            "padding-top": multiline ? "6px" : "0px",
            "padding-bottom": multiline ? "6px" : "0px",
        });

        forceStyles(prefixLabel, {
            "align-items": multiline ? "flex-start" : "center",
            "padding-top": multiline ? "3px" : "0px",
        });

        applyAutocompleteButtonLayout(fieldButton, { wrap: true, multiline });
    }

    function isButtonLabelWrapped(button) {
        if (!(button instanceof HTMLElement)) return false;

        const label = button.querySelector(":scope > .truncate");
        if (!(label instanceof HTMLElement)) return false;
        if (!normalizeText(label.textContent)) return false;

        const range = document.createRange();
        range.selectNodeContents(label);
        const textRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);

        if (textRects.length > 1) return true;

        const lineHeight = parseFloat(window.getComputedStyle(label).lineHeight);
        if (Number.isFinite(lineHeight) && lineHeight > 0) {
            return label.getBoundingClientRect().height > lineHeight * 1.5;
        }

        return label.getBoundingClientRect().height > 24;
    }

    function applyAutocompleteButtonLayout(button, options = {}) {
        if (!(button instanceof HTMLElement)) return;

        const wrap = options.wrap === true;
        const multiline = options.multiline === true;
        forceStyles(button, {
            display: "grid",
            "grid-template-columns": "minmax(0, 1fr) auto",
            "align-items": multiline ? "start" : "center",
            gap: "6px",
            "min-width": "0",
            height: "auto",
            "min-height": "30px",
            "padding-top": multiline ? "6px" : "0",
            "padding-bottom": multiline ? "6px" : "0",
        });

        const label = button.querySelector(":scope > .truncate");
        applyWideTextStyles(label, { wrap });

        const icon = button.querySelector(":scope > .flex-none");
        forceStyles(icon, {
            "align-self": multiline ? "start" : "center",
            "margin-top": multiline ? "1px" : "0",
        });
    }

    function styleSectionFrame(section) {
        if (!(section instanceof HTMLElement)) return;

        section.querySelectorAll(".flex, .baymax").forEach((node) => {
            forceStyles(node, {
                "min-width": "0",
            });
        });
    }

    function syncResizeHandle(row, mainContent, valueArea, hasResizableValueArea) {
        if (!(row instanceof HTMLElement)) return null;
        if (!(mainContent instanceof HTMLElement)) return null;
        if (!(valueArea instanceof HTMLElement)) return null;

        let splitter = mainContent.querySelector(`:scope > .${CONSTANTS.SPLITTER_CLASS}`);
        if (!(splitter instanceof HTMLElement)) {
            splitter = document.createElement("div");
            splitter.className = CONSTANTS.SPLITTER_CLASS;
            splitter.dataset.active = "0";
            splitter.title = CONSTANTS.SPLITTER_TITLE;
            splitter.setAttribute("role", "separator");
            splitter.setAttribute("aria-orientation", "vertical");
            splitter.setAttribute("aria-label", CONSTANTS.SPLITTER_TITLE);
            splitter.addEventListener("pointerdown", startResizeDrag);
        }

        if (splitter.parentElement !== mainContent || splitter.nextElementSibling !== valueArea) {
            mainContent.insertBefore(splitter, valueArea);
        }

        splitter.title = hasResizableValueArea ? CONSTANTS.SPLITTER_TITLE : "";
        splitter.setAttribute("aria-hidden", hasResizableValueArea ? "false" : "true");
        forceStyles(splitter, {
            display: hasResizableValueArea ? "flex" : "none",
        });

        if (!hasResizableValueArea) {
            splitter.dataset.active = "0";
        }

        return splitter;
    }

    function applyWideTextStyles(node, options = {}) {
        if (!(node instanceof HTMLElement)) return;

        const wrap = options.wrap === true;
        forceStyles(node, {
            display: "block",
            flex: "1 1 auto",
            "min-width": "0",
            overflow: wrap ? "visible" : "hidden",
            "text-overflow": "clip",
            "white-space": wrap ? "normal" : "nowrap",
            "overflow-wrap": wrap ? "anywhere" : "normal",
            "word-break": wrap ? "break-word" : "normal",
            "line-height": wrap ? "1.25" : "inherit",
        });
    }

    function syncTitles(popover) {
        if (!(popover instanceof HTMLElement)) return;

        popover.querySelectorAll(".existingFilterContainer .truncate").forEach(setTitleFromText);
        popover.querySelectorAll('.existingFilterContainer input[type="text"]').forEach(setTitleFromInput);
    }

    function setTitleFromText(node) {
        if (!(node instanceof HTMLElement)) return;

        const text = normalizeText(node.textContent);
        if (text) {
            node.title = text;
        } else {
            node.removeAttribute("title");
        }
    }

    function setTitleFromInput(node) {
        if (!(node instanceof HTMLInputElement)) return;

        const text = normalizeText(node.value || node.placeholder);
        if (text) {
            node.title = text;
        } else {
            node.removeAttribute("title");
        }
    }

    function hasMeaningfulValueContent(valueArea) {
        if (!(valueArea instanceof HTMLElement)) return false;

        if (valueArea.querySelector('input, textarea, [data-testid="textInputWithDebounce"], [role="button"], .truncate, .selectMenu')) {
            return true;
        }

        return normalizeText(valueArea.textContent).length > 0;
    }

    function getStoredSplitRatio(filterId, hasValueContent) {
        const storedRatio = filterId ? splitRatioByFilterId.get(filterId) : null;
        if (Number.isFinite(storedRatio)) return storedRatio;
        return hasValueContent ? CONSTANTS.DEFAULT_FIELD_GROUP_RATIO : CONSTANTS.DEFAULT_FIELD_GROUP_RATIO_EMPTY;
    }

    function getSplitTotalWidth(mainContent, hasResizableValueArea) {
        if (!(mainContent instanceof HTMLElement)) return 0;

        const splitterWidth = hasResizableValueArea ? CONSTANTS.SPLITTER_HIT_WIDTH_PX : 0;
        return Math.max(0, Math.floor(mainContent.getBoundingClientRect().width - splitterWidth));
    }

    function getSplitBounds(totalWidth, valueArea, hasValueContent) {
        const preferredMinValueWidth = getPreferredMinValueWidth(valueArea, hasValueContent);
        const minValueWidth = Math.min(preferredMinValueWidth, Math.max(0, totalWidth - CONSTANTS.FIELD_GROUP_MIN_WIDTH_PX));
        const maxFieldWidth = Math.max(0, totalWidth - minValueWidth);
        const minFieldWidth = Math.min(CONSTANTS.FIELD_GROUP_MIN_WIDTH_PX, maxFieldWidth);

        return {
            minFieldWidth,
            maxFieldWidth,
        };
    }

    function getPreferredMinValueWidth(valueArea, hasValueContent) {
        if (!hasValueContent) return CONSTANTS.EMPTY_VALUE_AREA_MIN_WIDTH_PX;
        if (!(valueArea instanceof HTMLElement)) return CONSTANTS.VALUE_AREA_MIN_WIDTH_PX;

        if (valueArea.querySelector(".modeSelect") && valueArea.querySelector(".numberOfDaysInput")) {
            return CONSTANTS.VALUE_AREA_COMPLEX_MIN_WIDTH_PX;
        }

        if (valueArea.querySelector(".modeSelect, .selectMenu")) {
            return CONSTANTS.VALUE_AREA_SELECT_MIN_WIDTH_PX;
        }

        return CONSTANTS.VALUE_AREA_MIN_WIDTH_PX;
    }

    function handleFormActivity(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.closest(CONSTANTS.POPOVER_SELECTOR)) return;
        scheduleApply();
    }

    function normalizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function setResizeMode(isActive) {
        document.documentElement.classList.toggle(CONSTANTS.ROOT_RESIZING_CLASS, isActive);
    }

    function forceStyles(node, styles) {
        if (!(node instanceof HTMLElement)) return;

        for (const [name, value] of Object.entries(styles)) {
            node.style.setProperty(name, value, "important");
        }
    }

    function isPopoverOrInside(node) {
        return node instanceof Element && (node.matches(CONSTANTS.POPOVER_SELECTOR) || !!node.closest(CONSTANTS.POPOVER_SELECTOR));
    }

    function containsPopover(node) {
        return node instanceof Element && !!node.querySelector(CONSTANTS.POPOVER_SELECTOR);
    }
})();
