// ==UserScript==
// @name         Rowy: JSON Auto-Fit Height
// @namespace    http://tampermonkey.net/
// @version      2026-01-09
// @description  Automatically resizes Rowy JSON editors to fit content when a new row is selected.
// @author       You
// @match        https://rowy.app/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const MAX_HEIGHT_VH = 75; // Max height as percentage of viewport height
    const CHECK_INTERVAL_MS = 250; // Polling interval to detect changes
    const MIN_HEIGHT_PX = 100; // Minimum height to enforce
    const EXTRA_PADDING_PX = 30; // Extra space for scrollbars/padding

    // State tracking
    // Key: The resizable DOM element (MuiBox)
    // Value: { uri: string }
    // We use a WeakMap so we don't leak memory if elements are removed
    const processedEditors = new WeakMap();

    function log(...args) {
        // Uncomment for debugging
        // console.log('[RowyAutoHeight]', ...args);
    }

    /**
     * Calculates the desired height for the editor based on its content.
     */
    function getContentHeight(editorEl) {
        // Method 1: Try using the Monaco Editor API (most accurate)
        if (window.monaco && window.monaco.editor) {
            const uri = editorEl.getAttribute('data-uri');
            if (uri) {
                // Find the model corresponding to this editor element
                // monaco.editor.getModels() returns all models. We find the one matching our URI.
                const model = window.monaco.editor.getModels().find(m => m.uri.toString() === uri);
                if (model) {
                    const lineCount = model.getLineCount();

                    // Try to read actual line height from DOM, default to 19px
                    const viewLine = editorEl.querySelector('.view-line');
                    const lineHeight = viewLine ? viewLine.offsetHeight : 19;

                    const calculatedHeight = (lineCount * lineHeight) + EXTRA_PADDING_PX;
                    log('Height from Monaco Model:', calculatedHeight, 'Lines:', lineCount);
                    return calculatedHeight;
                }
            }
        }

        // Method 2: DOM sniffing (fallback)
        // .view-lines usually contains the rendered height of the content
        // .margin-view-overlays also tracks the height
        const contentLayer = editorEl.querySelector('.view-lines') ||
                             editorEl.querySelector('.margin-view-overlays');

        if (contentLayer) {
            // Check if style.height is set explicitly (e.g. "442px")
            const styleH = parseInt(contentLayer.style.height, 10);
            if (!isNaN(styleH) && styleH > 0) {
                log('Height from DOM style:', styleH);
                return styleH + EXTRA_PADDING_PX;
            }
            // Fallback to offsetHeight
            log('Height from DOM offsetHeight:', contentLayer.offsetHeight);
            return contentLayer.offsetHeight + EXTRA_PADDING_PX;
        }

        return null;
    }

    /**
     * Main loop to check for editors and resize them.
     */
    function checkAndResize() {
        // Find all Monaco editors in JSON mode
        // Selector targets the editor container inside the Rowy UI
        const editors = document.querySelectorAll('.editor[data-mode-id="json"] .monaco-editor');

        editors.forEach(editor => {
            const uri = editor.getAttribute('data-uri');
            if (!uri) return;

            // Find the resizable container (MuiBox-root)
            // Hierarchy: MuiBox-root > section > .editor > .monaco-editor
            // We look for the closest MuiBox-root
            const resizableBox = editor.closest('.MuiBox-root');

            if (!resizableBox) return;

            // Check previous state
            const lastState = processedEditors.get(resizableBox);

            // If we have already resized this box for this specific Data URI,
            // we skip it to allow the user to manually resize it without us fighting back.
            if (lastState && lastState.uri === uri) {
                return;
            }

            // If it's a new URI (new row or data loaded), calculate and apply height.
            const desiredHeight = getContentHeight(editor);

            if (desiredHeight) {
                // Calculate constraints
                const maxPx = (window.innerHeight * MAX_HEIGHT_VH) / 100;
                const finalHeight = Math.min(Math.max(desiredHeight, MIN_HEIGHT_PX), maxPx);

                // Apply height
                resizableBox.style.height = `${finalHeight}px`;

                // Save state so we don't re-apply until URI changes
                processedEditors.set(resizableBox, { uri });

                log('Applied height:', finalHeight, 'for URI:', uri);
            }
        });
    }

    // Start polling
    setInterval(checkAndResize, CHECK_INTERVAL_MS);

    // Listen for window resize to re-check constraints if needed (optional)
    window.addEventListener('resize', checkAndResize);

    log('Script started');
})();
