// ==UserScript==
// @name         Retell: Bigger Extract Variables Modal
// @namespace    http://tampermonkey.net/
// @version      2026-03-27.2
// @description  Make the Retell variables modal larger, resizable, and better at handling long names and descriptions.
// @author       You
// @match        https://dashboard.retellai.com/*
// @icon         https://dashboard.retellai.com/favicon-dark.ico
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/retell/big_extract_variables.js
// @updateURL    https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/retell/big_extract_variables.js
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const CONSTANTS = {
        STYLE_ID: "tm-retell-big-extract-variables-style",
        DIALOG_CLASS: "tm-retell-big-extract-dialog",
        OVERLAY_CLASS: "tm-retell-big-extract-overlay",
        HEADER_CLASS: "tm-retell-big-extract-header",
        RESIZE_HANDLE_CLASS: "tm-retell-big-extract-resize-handle",
        NO_SELECT_CLASS: "tm-retell-big-extract-no-select",
        NAME_TEXTAREA_CLASS: "tm-retell-big-extract-name-textarea",
        NAME_TEXTAREA_ATTR: "data-tm-retell-big-extract-name-textarea",
        SOURCE_ID_ATTR: "data-tm-retell-big-extract-source-id",
        HIDDEN_INPUT_ATTR: "data-tm-retell-big-extract-hidden-input",
        PREV_STYLE_ATTR: "data-tm-retell-big-extract-prev-style",
        PREV_TABINDEX_ATTR: "data-tm-retell-big-extract-prev-tabindex",
        STABILIZE_FLAG: "tmRetellBigExtractStabilizeQueued",
        NONE_SENTINEL: "__tm-none__",
        VIEWPORT_MARGIN: 24,
        DEFAULT_TOP: 32,
        MIN_WIDTH: 520,
        MIN_HEIGHT: 420,
        DEFAULT_HEIGHT: 560,
        DESCRIPTION_MIN_HEIGHT: 200,
        NAME_MIN_HEIGHT: 54,
        NAME_MAX_HEIGHT: 180,
        RESIZE_HANDLE_SIZE: 22,
    };

    const state = {
        activeDialog: null,
        dialogObserver: null,
        scheduled: false,
        currentSize: null,
        currentPosition: null,
        activePointer: null,
        pointerRafId: 0,
        pendingPointerEvent: null,
        nextSourceId: 1,
        nameBindings: new Map(),
    };

    window.__retellBigExtractVariablesCleanup?.();

    injectStyles();
    window.addEventListener("resize", handleWindowResize, { passive: true });
    observeDom();
    scheduleApply();

    window.__retellBigExtractVariablesCleanup = cleanup;

    function cleanup() {
        state.dialogObserver?.disconnect();
        stopPointerInteraction(undefined, { skipUpdate: true });
        window.removeEventListener("resize", handleWindowResize);
        state.activeDialog = null;
        state.dialogObserver = null;
        state.scheduled = false;
        state.currentSize = null;
        state.currentPosition = null;
        state.pendingPointerEvent = null;

        state.nameBindings.forEach((detach) => {
            detach();
        });
        state.nameBindings.clear();

        document.getElementById(CONSTANTS.STYLE_ID)?.remove();
        document.documentElement.classList.remove(CONSTANTS.NO_SELECT_CLASS);
        document.querySelectorAll(`.${CONSTANTS.RESIZE_HANDLE_CLASS}`).forEach((handle) => handle.remove());

        document.querySelectorAll(`textarea[${CONSTANTS.NAME_TEXTAREA_ATTR}="1"]`).forEach((textarea) => {
            if (!(textarea instanceof HTMLTextAreaElement)) return;
            restoreNameInput(textarea.previousElementSibling, textarea);
        });
    }

    function observeDom() {
        const root = document.body;
        if (!(root instanceof HTMLBodyElement)) return;

        state.dialogObserver = new MutationObserver(() => {
            scheduleApply();
        });

        state.dialogObserver.observe(root, {
            childList: true,
        });
    }

    function handleWindowResize() {
        if (state.activePointer) {
            stopPointerInteraction(undefined, { skipUpdate: true });
        }
        scheduleApply();
    }

    function scheduleApply() {
        if (state.scheduled) return;
        state.scheduled = true;

        requestAnimationFrame(() => {
            state.scheduled = false;
            applyAll();
        });
    }

    function applyAll() {
        const dialog = findVariablesDialog();
        if (!(dialog instanceof HTMLElement)) {
            setActiveDialog(null);
            return;
        }

        setActiveDialog(dialog);
        queueInitialStabilization(dialog);
        applyDialogFrame(dialog);
        applyDialogLayout(dialog);
        ensureNameWrapTextarea(dialog);
        ensureDialogDragBinding(dialog);
        ensureResizeHandle(dialog);
    }

    function setActiveDialog(nextDialog) {
        if (state.activeDialog === nextDialog) return;

        stopPointerInteraction(undefined, { skipUpdate: true });
        state.activeDialog = nextDialog;

        if (!(nextDialog instanceof HTMLElement)) return;

        const geometry = getDialogGeometry(nextDialog);
        state.currentSize = geometry.size;
        state.currentPosition = geometry.position;
    }

    function queueInitialStabilization(dialog) {
        if (!(dialog instanceof HTMLElement)) return;
        if (dialog.dataset[CONSTANTS.STABILIZE_FLAG] === "1") return;

        dialog.dataset[CONSTANTS.STABILIZE_FLAG] = "1";
        const delays = [0, 40, 120, 260];
        for (const delay of delays) {
            window.setTimeout(() => {
                if (!dialog.isConnected) return;
                scheduleApply();
            }, delay);
        }
    }

    function applyDialogFrame(dialog) {
        const overlay = dialog.closest(".ReactModal__Overlay");
        const geometry = getDialogGeometry(dialog);
        const viewport = getViewportBounds();

        state.currentSize = geometry.size;
        state.currentPosition = geometry.position;

        dialog.classList.add(CONSTANTS.DIALOG_CLASS);

        if (overlay instanceof HTMLElement) {
            overlay.classList.add(CONSTANTS.OVERLAY_CLASS);
            forceStyles(overlay, {
                position: "fixed",
                inset: "0",
                transform: "none",
                display: "block",
                padding: "0",
                "box-sizing": "border-box",
                "overflow-y": "hidden",
                "overflow-x": "hidden",
                "background-color": "transparent",
            });
        }

        forceStyles(dialog, {
            position: "absolute",
            inset: "auto",
            margin: "0",
            transform: "none",
            left: `${geometry.position.left}px`,
            top: `${geometry.position.top}px`,
            width: `${geometry.size.width}px`,
            height: `${geometry.size.height}px`,
            "max-width": `${viewport.width}px`,
            "max-height": `${viewport.height}px`,
            "min-width": `${Math.min(CONSTANTS.MIN_WIDTH, viewport.width)}px`,
            "min-height": `${Math.min(CONSTANTS.MIN_HEIGHT, viewport.height)}px`,
            display: "flex",
            "flex-direction": "column",
            "box-sizing": "border-box",
            overflow: "hidden",
        });
    }

    function applyDialogLayout(dialog) {
        const body = dialog.firstElementChild;
        const headerRow = findHeaderRow(dialog);
        const nameField = findNameField(dialog);
        const descriptionField = findDescriptionField(dialog);
        const footerRow = findFooterRow(dialog);
        const descriptionGroup = descriptionField?.group || null;

        if (body instanceof HTMLElement) {
            forceStyles(body, {
                display: "flex",
                "flex-direction": "column",
                flex: "1 1 auto",
                height: "100%",
                "min-height": "0",
                width: "100%",
                overflow: "hidden",
            });

            Array.from(body.children).forEach((child) => {
                if (!(child instanceof HTMLElement)) return;
                forceStyles(child, {
                    "min-height": "0",
                    "min-width": "0",
                });
                if (child === descriptionGroup) {
                    forceStyles(child, {
                        display: "flex",
                        "flex-direction": "column",
                        flex: "1 1 auto",
                        "min-height": "0",
                    });
                } else {
                    forceStyles(child, {
                        flex: "0 0 auto",
                    });
                }
            });
        }

        if (headerRow instanceof HTMLElement) {
            headerRow.classList.add(CONSTANTS.HEADER_CLASS);
            forceStyles(headerRow, {
                flex: "0 0 auto",
            });
        }

        if (nameField?.group instanceof HTMLElement) {
            forceStyles(nameField.group, {
                display: "flex",
                "flex-direction": "column",
                flex: "0 0 auto",
                "min-height": "0",
                "min-width": "0",
            });
        }

        applyDescriptionFieldLayout(descriptionField);

        if (footerRow instanceof HTMLElement) {
            forceStyles(footerRow, {
                flex: "0 0 auto",
                "padding-right": `${Math.max(16, CONSTANTS.RESIZE_HANDLE_SIZE)}px`,
            });
        }
    }

    function applyDescriptionFieldLayout(field) {
        const group = field?.group || null;
        const label = field?.label || null;
        const textarea = field?.control || null;

        if (group instanceof HTMLElement) {
            forceStyles(group, {
                display: "flex",
                "flex-direction": "column",
                flex: "1 1 auto",
                "min-height": "0",
                "min-width": "0",
                overflow: "hidden",
            });
        }

        if (label instanceof HTMLElement) {
            forceStyles(label, {
                flex: "0 0 auto",
            });
        }

        if (!(group instanceof HTMLElement)) return;
        if (!(textarea instanceof HTMLTextAreaElement)) return;

        for (const wrapper of wrapperChainBetween(group, textarea)) {
            forceStyles(wrapper, {
                display: "flex",
                "flex-direction": "column",
                flex: "1 1 auto",
                "min-height": "0",
                "min-width": "0",
                overflow: "hidden",
            });
        }

        forceStyles(textarea, {
            display: "block",
            flex: "1 1 auto",
            height: "100%",
            width: "100%",
            "min-width": "0",
            "min-height": `${CONSTANTS.DESCRIPTION_MIN_HEIGHT}px`,
            "max-height": "none",
            "box-sizing": "border-box",
            "align-self": "stretch",
            resize: "none",
            overflow: "auto",
            "overflow-x": "hidden",
            "white-space": "pre-wrap",
            "overflow-wrap": "anywhere",
            "word-break": "break-word",
            "line-height": "1.45",
            "pointer-events": "auto",
            position: "relative",
            "z-index": "1",
        });
    }

    function wrapperChainBetween(ancestor, descendant) {
        const chain = [];
        let current = descendant.parentElement;

        while (current && current !== ancestor) {
            chain.push(current);
            current = current.parentElement;
        }

        return chain.reverse();
    }

    function ensureNameWrapTextarea(dialog) {
        const field = findNameField(dialog);
        if (!(field?.group instanceof HTMLElement)) return;

        const group = field.group;

        forceStyles(group, {
            display: "flex",
            "flex-direction": "column",
            "min-height": "0",
            "min-width": "0",
        });

        const nativeTextarea = group.querySelector(`textarea:not([${CONSTANTS.NAME_TEXTAREA_ATTR}="1"])`);
        if (nativeTextarea instanceof HTMLTextAreaElement && !(group.querySelector("input") instanceof HTMLInputElement)) {
            applyNameTextareaStyles(nativeTextarea);
            autosizeNameTextarea(nativeTextarea);
            return;
        }

        const input = group.querySelector("input");
        if (!(input instanceof HTMLInputElement)) return;

        const sourceId = getSourceId(input);
        const customTextareas = Array.from(group.querySelectorAll(`textarea[${CONSTANTS.NAME_TEXTAREA_ATTR}="1"]`));
        let textarea = customTextareas.find((candidate) => candidate.getAttribute(CONSTANTS.SOURCE_ID_ATTR) === sourceId) || null;

        customTextareas.forEach((candidate) => {
            if (candidate === textarea) return;
            candidate.remove();
        });

        if (!(textarea instanceof HTMLTextAreaElement)) {
            textarea = createNameTextarea(input);
        }

        hideOriginalInput(input);
        syncNameTextarea(textarea, input);
    }

    function findVariablesDialog() {
        const dialogs = Array.from(document.querySelectorAll(".ReactModal__Content[role='dialog'], .ReactModal__Content"));
        return dialogs.reverse().find((dialog) => isVariablesDialog(dialog)) || null;
    }

    function isVariablesDialog(dialog) {
        if (!(dialog instanceof HTMLElement)) return false;
        return !!findHeaderRow(dialog) && !!findNameField(dialog) && !!findDescriptionField(dialog);
    }

    function findNameField(dialog) {
        return findLabeledField(dialog, "Variable Name", "input, textarea");
    }

    function findDescriptionField(dialog) {
        return findLabeledField(dialog, "Description", "textarea");
    }

    function findHeaderRow(dialog) {
        const body = dialog.firstElementChild;
        if (!(body instanceof HTMLElement)) return null;

        return Array.from(body.children).find((child) => {
            return (
                child instanceof HTMLElement &&
                child.querySelector('button[aria-label="Close"]') &&
                hasExactText(child, "Variables")
            );
        }) || null;
    }

    function findFooterRow(dialog) {
        const body = dialog.firstElementChild;
        if (!(body instanceof HTMLElement)) return null;

        return (
            Array.from(body.children)
                .reverse()
                .find((child) => {
                    return child instanceof HTMLElement && child.querySelectorAll("button").length >= 2;
                }) || null
        );
    }

    function findLabeledField(dialog, labelText, controlSelector) {
        const labels = Array.from(dialog.querySelectorAll("div, label, span, p")).filter((element) => {
            return element instanceof HTMLElement && cleanText(element.textContent) === labelText;
        });

        for (const label of labels) {
            let scope = label.parentElement;
            while (scope && scope !== dialog.parentElement) {
                const control = findFollowingControlInScope(label, scope, controlSelector);
                if (control instanceof HTMLElement) {
                    return {
                        label,
                        control,
                        group: findSharedContainer(label, control, dialog),
                    };
                }
                if (scope === dialog) break;
                scope = scope.parentElement;
            }
        }

        return null;
    }

    function findFollowingControlInScope(label, scope, controlSelector) {
        const controls = Array.from(scope.querySelectorAll(controlSelector));
        return (
            controls.find((control) => {
                return !!(label.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING);
            }) || null
        );
    }

    function findSharedContainer(label, control, dialog) {
        let current = control.parentElement;
        while (current && current !== dialog) {
            if (current.contains(label) && current.contains(control)) {
                return current;
            }
            current = current.parentElement;
        }

        return control.parentElement || label.parentElement || null;
    }

    function createNameTextarea(input) {
        const textarea = document.createElement("textarea");
        const sourceId = getSourceId(input);
        let composing = false;

        detachNameBinding(input);

        textarea.className = `${input.className} ${CONSTANTS.NAME_TEXTAREA_CLASS}`.trim();
        textarea.setAttribute(CONSTANTS.NAME_TEXTAREA_ATTR, "1");
        textarea.setAttribute(CONSTANTS.SOURCE_ID_ATTR, sourceId);
        textarea.placeholder = input.placeholder || "";
        textarea.value = input.value || "";
        textarea.rows = 1;
        textarea.readOnly = input.readOnly;
        textarea.disabled = input.disabled;
        textarea.spellcheck = input.spellcheck;
        textarea.autocomplete = input.autocomplete || "off";
        textarea.setAttribute("aria-label", "Variable Name");

        if (input.maxLength > 0) {
            textarea.maxLength = input.maxLength;
        }

        input.insertAdjacentElement("afterend", textarea);
        hideOriginalInput(input);

        const syncToInput = () => {
            setNativeValue(input, textarea.value);
            dispatchInput(input);
        };

        const syncFromInput = () => {
            if (!textarea.isConnected) return;
            if (textarea.value === (input.value || "")) return;
            textarea.value = input.value || "";
            syncNameTextarea(textarea, input);
        };

        textarea.addEventListener("compositionstart", (event) => {
            composing = true;
            input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: event.data ?? "" }));
        });

        textarea.addEventListener("compositionupdate", (event) => {
            input.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: event.data ?? "" }));
        });

        textarea.addEventListener("compositionend", (event) => {
            composing = false;
            syncToInput();
            input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: event.data ?? "" }));
        });

        textarea.addEventListener("input", () => {
            if (!composing) {
                syncToInput();
            }
            syncNameTextarea(textarea, input);
        });

        textarea.addEventListener("focus", () => {
            input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
        });

        textarea.addEventListener("blur", () => {
            syncToInput();
            input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });

        input.addEventListener("input", syncFromInput);
        input.addEventListener("change", syncFromInput);
        state.nameBindings.set(input, () => {
            input.removeEventListener("input", syncFromInput);
            input.removeEventListener("change", syncFromInput);
        });

        syncNameTextarea(textarea, input);
        return textarea;
    }

    function hideOriginalInput(input) {
        if (!(input instanceof HTMLInputElement)) return;
        if (input.getAttribute(CONSTANTS.HIDDEN_INPUT_ATTR) === "1") return;

        input.setAttribute(CONSTANTS.HIDDEN_INPUT_ATTR, "1");
        input.setAttribute(CONSTANTS.PREV_STYLE_ATTR, input.getAttribute("style") ?? CONSTANTS.NONE_SENTINEL);
        input.setAttribute(CONSTANTS.PREV_TABINDEX_ATTR, input.getAttribute("tabindex") ?? CONSTANTS.NONE_SENTINEL);
        input.tabIndex = -1;
        input.setAttribute("aria-hidden", "true");

        forceStyles(input, {
            position: "absolute",
            left: "-20000px",
            top: "auto",
            width: "1px",
            height: "1px",
            margin: "0",
            padding: "0",
            border: "0",
            opacity: "0",
            "pointer-events": "none",
        });
    }

    function restoreNameInput(input, textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) return;

        const sourceId = textarea.getAttribute(CONSTANTS.SOURCE_ID_ATTR);
        if (!(input instanceof HTMLInputElement) && sourceId && textarea.parentElement instanceof HTMLElement) {
            input = textarea.parentElement.querySelector(`input[${CONSTANTS.SOURCE_ID_ATTR}="${sourceId}"]`);
        }

        if (input instanceof HTMLInputElement && input.getAttribute(CONSTANTS.HIDDEN_INPUT_ATTR) === "1") {
            detachNameBinding(input);
            const prevStyle = input.getAttribute(CONSTANTS.PREV_STYLE_ATTR);
            const prevTabIndex = input.getAttribute(CONSTANTS.PREV_TABINDEX_ATTR);

            input.removeAttribute(CONSTANTS.HIDDEN_INPUT_ATTR);
            input.removeAttribute("aria-hidden");

            if (prevStyle === CONSTANTS.NONE_SENTINEL || prevStyle === null) {
                input.removeAttribute("style");
            } else {
                input.setAttribute("style", prevStyle);
            }

            if (prevTabIndex === CONSTANTS.NONE_SENTINEL || prevTabIndex === null) {
                input.removeAttribute("tabindex");
            } else {
                input.setAttribute("tabindex", prevTabIndex);
            }

            input.removeAttribute(CONSTANTS.PREV_STYLE_ATTR);
            input.removeAttribute(CONSTANTS.PREV_TABINDEX_ATTR);
        }

        textarea.remove();
    }

    function autosizeNameTextarea(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) return;

        textarea.classList.add(CONSTANTS.NAME_TEXTAREA_CLASS);
        textarea.style.setProperty("height", "auto", "important");

        const dialog = textarea.closest(`.${CONSTANTS.DIALOG_CLASS}, .ReactModal__Content`);
        const dialogHeight = dialog instanceof HTMLElement ? dialog.getBoundingClientRect().height : window.innerHeight;
        const dialogMax = Math.max(CONSTANTS.NAME_MIN_HEIGHT, Math.floor(dialogHeight * 0.28));
        const viewportMax = Math.max(CONSTANTS.NAME_MIN_HEIGHT, Math.floor(window.innerHeight * 0.24));
        const maxHeight = Math.min(CONSTANTS.NAME_MAX_HEIGHT, dialogMax, viewportMax);
        const nextHeight = clamp(textarea.scrollHeight, CONSTANTS.NAME_MIN_HEIGHT, maxHeight);

        textarea.style.setProperty("height", `${nextHeight}px`, "important");
        textarea.style.setProperty("overflow-y", nextHeight >= maxHeight ? "auto" : "hidden", "important");
    }

    function syncNameTextarea(textarea, input) {
        if (!(textarea instanceof HTMLTextAreaElement)) return;
        if (!(input instanceof HTMLInputElement)) return;

        applyNameTextareaStyles(textarea);
        textarea.readOnly = input.readOnly;
        textarea.disabled = input.disabled;
        textarea.placeholder = input.placeholder || "";

        if (textarea.value !== (input.value || "")) {
            textarea.value = input.value || "";
        }

        autosizeNameTextarea(textarea);
    }

    function applyNameTextareaStyles(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) return;

        textarea.classList.add(CONSTANTS.NAME_TEXTAREA_CLASS);
        forceStyles(textarea, {
            display: "block",
            width: "100%",
            "min-width": "0",
            "min-height": `${CONSTANTS.NAME_MIN_HEIGHT}px`,
            "max-height": `${CONSTANTS.NAME_MAX_HEIGHT}px`,
            resize: "none",
            overflow: "auto",
            "overflow-x": "hidden",
            "white-space": "pre-wrap",
            "overflow-wrap": "anywhere",
            "word-break": "break-word",
            "line-height": "1.35",
        });
    }

    function getSourceId(input) {
        if (!(input instanceof HTMLInputElement)) return "";
        let sourceId = input.getAttribute(CONSTANTS.SOURCE_ID_ATTR);
        if (sourceId) return sourceId;

        sourceId = `tm-retell-big-extract-source-${state.nextSourceId++}`;
        input.setAttribute(CONSTANTS.SOURCE_ID_ATTR, sourceId);
        return sourceId;
    }

    function detachNameBinding(input) {
        if (!(input instanceof HTMLInputElement)) return;
        const detach = state.nameBindings.get(input);
        if (typeof detach === "function") {
            detach();
        }
        state.nameBindings.delete(input);
    }

    function ensureDialogDragBinding(dialog) {
        const header = findHeaderRow(dialog);
        if (!(header instanceof HTMLElement)) return;
        if (header.dataset.tmDragBound === "1") return;

        header.addEventListener("pointerdown", handleDialogDragPointerDown);
        header.dataset.tmDragBound = "1";
    }

    function handleDialogDragPointerDown(event) {
        if (!(event.currentTarget instanceof HTMLElement)) return;
        if (event.button !== 0) return;
        if (isInteractiveTarget(event.target)) return;

        const dialog = event.currentTarget.closest(".ReactModal__Content");
        if (!(dialog instanceof HTMLElement)) return;

        startPointerInteraction("drag", event, dialog, event.currentTarget);
    }

    function ensureResizeHandle(dialog) {
        let handle = dialog.querySelector(`:scope > .${CONSTANTS.RESIZE_HANDLE_CLASS}`);
        if (!(handle instanceof HTMLElement)) {
            handle = document.createElement("div");
            handle.className = CONSTANTS.RESIZE_HANDLE_CLASS;
            handle.title = "Resize variables modal";
            handle.setAttribute("aria-label", "Resize variables modal");
            dialog.appendChild(handle);
        }

        if (handle.dataset.tmResizeBound === "1") return;

        handle.addEventListener("pointerdown", handleResizePointerDown);
        handle.dataset.tmResizeBound = "1";
    }

    function handleResizePointerDown(event) {
        if (!(event.currentTarget instanceof HTMLElement)) return;
        if (event.button !== 0) return;

        const dialog = event.currentTarget.closest(".ReactModal__Content");
        if (!(dialog instanceof HTMLElement)) return;

        startPointerInteraction("resize", event, dialog, event.currentTarget);
    }

    function startPointerInteraction(mode, event, dialog, handle) {
        stopPointerInteraction(undefined, { skipUpdate: true });

        const geometry = getDialogGeometry(dialog);
        state.currentSize = geometry.size;
        state.currentPosition = geometry.position;
        state.activePointer = {
            mode,
            pointerId: event.pointerId,
            dialog,
            handle,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startPosition: { ...geometry.position },
            startSize: { ...geometry.size },
        };
        state.pendingPointerEvent = event;

        handle.setPointerCapture?.(event.pointerId);
        document.documentElement.classList.add(CONSTANTS.NO_SELECT_CLASS);

        window.addEventListener("pointermove", handleActivePointerMove, true);
        window.addEventListener("pointerup", stopPointerInteraction, true);
        window.addEventListener("pointercancel", stopPointerInteraction, true);
        window.addEventListener("blur", stopPointerInteraction, true);

        event.preventDefault();
        event.stopPropagation();
    }

    function handleActivePointerMove(event) {
        if (!state.activePointer) return;
        if (event.pointerId !== state.activePointer.pointerId) return;

        state.pendingPointerEvent = event;
        if (state.pointerRafId) return;

        state.pointerRafId = window.requestAnimationFrame(() => {
            state.pointerRafId = 0;
            flushActivePointer();
        });

        event.preventDefault();
    }

    function stopPointerInteraction(event, options = {}) {
        if (!state.activePointer) return;
        if (event instanceof PointerEvent && event.type !== "blur" && event.pointerId !== state.activePointer.pointerId) return;

        if (state.pointerRafId) {
            window.cancelAnimationFrame(state.pointerRafId);
            state.pointerRafId = 0;
        }

        if (options.skipUpdate !== true) {
            flushActivePointer();
        }

        state.activePointer.handle?.releasePointerCapture?.(state.activePointer.pointerId);
        state.activePointer = null;
        state.pendingPointerEvent = null;

        document.documentElement.classList.remove(CONSTANTS.NO_SELECT_CLASS);
        window.removeEventListener("pointermove", handleActivePointerMove, true);
        window.removeEventListener("pointerup", stopPointerInteraction, true);
        window.removeEventListener("pointercancel", stopPointerInteraction, true);
        window.removeEventListener("blur", stopPointerInteraction, true);
    }

    function flushActivePointer() {
        if (!state.activePointer) return;
        if (!(state.activePointer.dialog instanceof HTMLElement) || !state.activePointer.dialog.isConnected) {
            stopPointerInteraction(undefined, { skipUpdate: true });
            return;
        }
        if (!(state.pendingPointerEvent instanceof PointerEvent)) return;

        const deltaX = state.pendingPointerEvent.clientX - state.activePointer.startClientX;
        const deltaY = state.pendingPointerEvent.clientY - state.activePointer.startClientY;

        if (state.activePointer.mode === "drag") {
            state.currentPosition = clampPosition(
                {
                    left: state.activePointer.startPosition.left + deltaX,
                    top: state.activePointer.startPosition.top + deltaY,
                },
                state.activePointer.startSize
            );
        } else {
            state.currentSize = clampSize(
                {
                    width: state.activePointer.startSize.width + deltaX,
                    height: state.activePointer.startSize.height + deltaY,
                },
                state.activePointer.startPosition
            );
            state.currentPosition = clampPosition(state.activePointer.startPosition, state.currentSize);
        }

        applyDialogFrame(state.activePointer.dialog);
        applyDialogLayout(state.activePointer.dialog);
        ensureNameWrapTextarea(state.activePointer.dialog);
    }

    function injectStyles() {
        if (document.getElementById(CONSTANTS.STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = CONSTANTS.STYLE_ID;
        style.textContent = `
            .${CONSTANTS.DIALOG_CLASS} {
                min-width: 0 !important;
            }

            .${CONSTANTS.DIALOG_CLASS} * {
                box-sizing: border-box;
            }

            .${CONSTANTS.DIALOG_CLASS} .${CONSTANTS.HEADER_CLASS} {
                cursor: move !important;
                user-select: none !important;
                touch-action: none !important;
            }

            .${CONSTANTS.DIALOG_CLASS} .${CONSTANTS.HEADER_CLASS} button {
                cursor: pointer !important;
            }

            .${CONSTANTS.DIALOG_CLASS} .${CONSTANTS.NAME_TEXTAREA_CLASS} {
                width: 100% !important;
                min-width: 0 !important;
                min-height: ${CONSTANTS.NAME_MIN_HEIGHT}px !important;
                max-height: ${CONSTANTS.NAME_MAX_HEIGHT}px !important;
                resize: none !important;
                overflow: auto !important;
                overflow-x: hidden !important;
                white-space: pre-wrap !important;
                overflow-wrap: anywhere !important;
                word-break: break-word !important;
                line-height: 1.35 !important;
            }

            .${CONSTANTS.DIALOG_CLASS} .${CONSTANTS.RESIZE_HANDLE_CLASS} {
                position: absolute !important;
                right: 6px !important;
                bottom: 6px !important;
                width: ${CONSTANTS.RESIZE_HANDLE_SIZE}px !important;
                height: ${CONSTANTS.RESIZE_HANDLE_SIZE}px !important;
                cursor: nwse-resize !important;
                border-radius: 6px !important;
                z-index: 10 !important;
                opacity: 0.75 !important;
                pointer-events: auto !important;
                touch-action: none !important;
                background:
                    linear-gradient(135deg, transparent 0 46%, rgba(0, 0, 0, 0.22) 46% 54%, transparent 54% 63%, rgba(0, 0, 0, 0.22) 63% 71%, transparent 71%) !important;
            }

            .${CONSTANTS.DIALOG_CLASS} .${CONSTANTS.RESIZE_HANDLE_CLASS}:hover {
                opacity: 1 !important;
            }

            html.${CONSTANTS.NO_SELECT_CLASS},
            html.${CONSTANTS.NO_SELECT_CLASS} * {
                user-select: none !important;
            }
        `;

        document.documentElement.appendChild(style);
    }

    function defaultDialogSize(dialog) {
        const rect = dialog.getBoundingClientRect();
        const inlineWidth = parsePx(dialog.style.width);
        const measuredWidth = Math.round(rect.width || inlineWidth || 360);
        const measuredHeight = Math.round(rect.height || parsePx(dialog.style.height) || CONSTANTS.DEFAULT_HEIGHT);

        return {
            width: measuredWidth * 2,
            height: Math.max(Math.round(measuredHeight * 1.45), CONSTANTS.DEFAULT_HEIGHT),
        };
    }

    function defaultDialogPosition(size) {
        const viewport = getViewportBounds();
        return clampPosition(
            {
                left: Math.round((window.innerWidth - size.width) / 2),
                top: Math.max(CONSTANTS.DEFAULT_TOP, viewport.top),
            },
            size
        );
    }

    function getDialogGeometry(dialog) {
        const initialSize = clampSize(state.currentSize || defaultDialogSize(dialog));
        const initialPosition = clampPosition(state.currentPosition || defaultDialogPosition(initialSize), initialSize);
        const size = clampSize(initialSize, initialPosition);
        const position = clampPosition(initialPosition, size);

        return { size, position };
    }

    function clampSize(size, position) {
        const viewport = getViewportBounds();
        const maxWidth = Math.max(
            360,
            Math.round(position ? viewport.right - position.left : viewport.width)
        );
        const maxHeight = Math.max(
            320,
            Math.round(position ? viewport.bottom - position.top : viewport.height)
        );
        const minWidth = Math.min(CONSTANTS.MIN_WIDTH, maxWidth);
        const minHeight = Math.min(CONSTANTS.MIN_HEIGHT, maxHeight);

        return {
            width: clamp(size.width, minWidth, maxWidth),
            height: clamp(size.height, minHeight, maxHeight),
        };
    }

    function clampPosition(position, size) {
        const viewport = getViewportBounds();
        const nextSize = clampSize(size);
        const maxLeft = Math.max(viewport.left, viewport.right - nextSize.width);
        const maxTop = Math.max(viewport.top, viewport.bottom - nextSize.height);

        return {
            left: clamp(position.left, viewport.left, maxLeft),
            top: clamp(position.top, viewport.top, maxTop),
        };
    }

    function getViewportBounds() {
        const left = CONSTANTS.VIEWPORT_MARGIN;
        const top = CONSTANTS.VIEWPORT_MARGIN;
        const right = Math.max(left + 320, window.innerWidth - CONSTANTS.VIEWPORT_MARGIN);
        const bottom = Math.max(top + 280, window.innerHeight - CONSTANTS.VIEWPORT_MARGIN);

        return {
            left,
            top,
            right,
            bottom,
            width: Math.max(320, right - left),
            height: Math.max(280, bottom - top),
        };
    }

    function setNativeValue(element, value) {
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        descriptor?.set?.call(element, value);
    }

    function dispatchInput(element) {
        element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }

    function forceStyles(element, styles) {
        if (!(element instanceof HTMLElement)) return;
        for (const [property, value] of Object.entries(styles)) {
            element.style.setProperty(property, value, "important");
        }
    }

    function isInteractiveTarget(target) {
        return target instanceof Element && !!target.closest("button, input, textarea, select, option, a");
    }

    function hasExactText(scope, expectedText) {
        return Array.from(scope.querySelectorAll("div, span, label, p")).some((element) => {
            return element instanceof HTMLElement && cleanText(element.textContent) === expectedText;
        });
    }

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function parsePx(value) {
        const parsed = parseFloat(String(value || ""));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function clamp(value, min, max) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return min;
        return Math.min(max, Math.max(min, Math.round(numericValue)));
    }
})();
