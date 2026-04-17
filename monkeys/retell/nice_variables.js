// ==UserScript==
// @name         Retell: Nice Variables
// @namespace    http://tampermonkey.net/
// @version      2025-11-04
// @description  try to take over the world!
// @author       You
// @match        https://dashboard.retellai.com/agents*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        none
// @icon         https://dashboard.retellai.com/favicon-dark.ico
// @downloadURL  https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/retell/nice_variables.js
// @updateURL    https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/retell/nice_variables.js
// ==/UserScript==

(() => {
    console.log("test");
  // ====== TWEAK THESE ======

  const DIALOG_MAX_WIDTH_PX = 1400; // overall dialog width cap
  const HEIGHT_VH = 80; // list height (viewport %): try 70–90
  const NAME_COL_PCT = 28; // % for "Variable Name" column; lower = more space for "Default Value"
  // ==========================

  // Cleanup any previous run
  window.__retellTweaksCleanup?.();

  const STYLE_ID = 'retell-popover-all-in-one';
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-radix-popper-content-wrapper]{ max-width:95vw !important; }
    [data-radix-popper-content-wrapper] > [role="dialog"]{
      width:min(${DIALOG_MAX_WIDTH_PX}px,95vw) !important;
      max-width:none !important;
    }
    /* Inputs and our textarea fill their cells */
    [data-radix-popper-content-wrapper] input,
    [data-radix-popper-content-wrapper] textarea.__retell-bigedit{
      width:100% !important; min-width:0 !important;
    }
    /* Value textarea styling */
    textarea.__retell-bigedit{
      min-height:80px; line-height:1.4; resize:vertical;
      padding:10px 12px; border-radius:8px; border:1px solid var(--border, #ccc);
      font-size:.875rem; outline:none;
    }
  `;
  document.head.appendChild(style);

  const findPoppers = () =>
    Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper]'))
      .filter(w => w.querySelector('[role="dialog"]'));

  const autosize = (ta) => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(600, ta.scrollHeight) + 'px';
  };

  // --- Force translateY to 0px on the wrapper (prevents top being cut off) ---
  const forceTranslateY0 = (wrap) => {
    const parseTranslate = (t) => {
      if (!t) return { type: 'translate', x: '0px', y: '0px', z: null };
      let m = t.match(/translate3d\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
      if (m) return { type: 'translate3d', x: m[1].trim(), y: m[2].trim(), z: m[3].trim() };
      m = t.match(/translate\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
      if (m) return { type: 'translate', x: m[1].trim(), y: m[2].trim(), z: null };
      return { type: 'translate', x: '0px', y: '0px', z: null };
    };

    const cur = wrap.style.transform || '';
    const { type, x } = parseTranslate(cur);
    const newTransform = (type === 'translate3d')
      ? `translate3d(${x || '0px'}, 0px, 0px)`
      : `translate(${x || '0px'}, 0px)`;
    wrap.style.transform = newTransform;
    wrap.style.top = '0px';
  };

  const attachStyleObserver = (wrap) => {
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          forceTranslateY0(wrap);
        }
      }
    });
    obs.observe(wrap, { attributes: true, attributeFilter: ['style'] });
    return obs;
  };

  // --- Column sizing (header + rows) ---
  const sizeColumns = (wrap) => {
    // Header ("Variable Name" / "Default Value")
    const headerGroup = wrap.querySelector('.flex.w-full.flex-row.px-1 .flex.w-full.flex-row')
                       || wrap.querySelector('[data-radix-popper-content-wrapper] .flex.w-full.flex-row .flex.w-full.flex-row');
    if (headerGroup) {
      const headerCols = headerGroup.querySelectorAll(':scope > .flex-1');
      if (headerCols.length >= 2) {
        headerCols[0].style.flex = `0 0 ${NAME_COL_PCT}%`;
        headerCols[0].style.maxWidth = `${NAME_COL_PCT}%`;
        headerCols[0].style.minWidth = '160px';
        headerCols[1].style.flex = '1 1 auto';
        headerCols[1].style.minWidth = '0';
      }
    }

    // Data rows
    wrap.querySelectorAll('div.flex.flex-row.items-center.gap-1').forEach(row => {
      const group = row.querySelector(':scope > div.flex.flex-row.items-center.gap-2')
                 || row.querySelector(':scope > div.flex.flex-row');
      if (!group) return;
      group.style.flex = '1 1 auto';
      group.style.minWidth = '0';

      const cols = group.querySelectorAll(':scope > .flex-1');
      if (cols.length >= 2) {
        cols[0].style.flex = `0 0 ${NAME_COL_PCT}%`;
        cols[0].style.maxWidth = `${NAME_COL_PCT}%`;
        cols[0].style.minWidth = '160px';

        cols[1].style.flex = '1 1 auto';
        cols[1].style.minWidth = '0';

        cols[0].querySelectorAll('input,textarea').forEach(el => { el.style.width='100%'; el.style.minWidth='0'; });
        cols[1].querySelectorAll('input,textarea').forEach(el => { el.style.width='100%'; el.style.minWidth='0'; });
      }

      const btn = row.querySelector(':scope > button');
      if (btn) btn.style.flexShrink = '0';
    });
  };

  // --- Height handling: bump Radix vars and inner scroller cap ---
  const growHeight = (wrap) => {
    wrap.style.setProperty('--radix-popper-available-height', `${HEIGHT_VH}vh`, 'important');
    const dialog = wrap.querySelector('[role="dialog"]');
    if (dialog) {
      dialog.style.setProperty('--radix-popover-content-available-height', `${HEIGHT_VH}vh`, 'important');
      dialog.style.setProperty('max-height', `${Math.min(95, HEIGHT_VH + 10)}vh`, 'important');
    }
    const scrollers = wrap.querySelectorAll('[class*="overflow-y-auto"], [style*="overflow-y: auto"], [class*="max-h-\\[328px\\]"]');
    scrollers.forEach(s => {
      s.style.setProperty('max-height', `${HEIGHT_VH}vh`, 'important');
      s.style.setProperty('height', 'auto', 'important');
      s.style.setProperty('overflow-y', 'auto', 'important');
    });
    return scrollers.length;
  };

  // --- Helpers for React-backed inputs ---
  const setNativeValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc && desc.set && desc.set.call(el, value); // updates React's internal tracker
  };

  const dispatchInput = (el) => {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  };

  // --- Upgrade "Value" inputs to resizable textareas (keeps React bindings) ---
  const autosizeLater = (ta) => requestAnimationFrame(() => autosize(ta));

  const enhanceValueInput = (inp) => {
    if (!(inp instanceof HTMLInputElement)) return false;
    if (inp.dataset.__retellEnhanced === '1') return false;

    const ta = document.createElement('textarea');
    ta.className = (inp.getAttribute('class') || '') + ' __retell-bigedit';
    ta.placeholder = inp.placeholder || '';
    ta.value = inp.value || '';

    // Insert after the input so label/for still points to the input
    inp.insertAdjacentElement('afterend', ta);

    // Hide input off-screen but keep it in the document for React/form libs
    inp.dataset.__retellPrevStyle = inp.getAttribute('style') || '';
    Object.assign(inp.style, {
      position: 'absolute',
      left: '-9999px',
      top: 'auto',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      margin: '0',
      padding: '0',
      opacity: '0', // keep focusable programmatically
      pointerEvents: 'none', // avoid accidental clicks
    });

    // --- Two-way sync ---
    let composing = false;

    const syncToInput = () => {
      setNativeValue(inp, ta.value);
      dispatchInput(inp); // React "sees" it
    };

    const syncFromInput = () => {
      // If React updates the input (controlled component), reflect in textarea
      if (ta.value !== inp.value) {
        ta.value = inp.value || '';
        autosize(ta);
      }
    };

    ta.addEventListener('compositionstart', (e) => {
      composing = true;
      inp.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: e.data ?? '' }));
    });
    ta.addEventListener('compositionupdate', (e) => {
      inp.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: e.data ?? '' }));
    });
    ta.addEventListener('compositionend', (e) => {
      composing = false;
      // Ensure final value is committed to the input after IME
      syncToInput();
      inp.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: e.data ?? '' }));
    });

    ta.addEventListener('input', () => {
      autosize(ta);
      if (!composing) syncToInput();
    });

    // Forward focus/blur so "touched/dirty" states work
    ta.addEventListener('focus', () => {
      inp.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    });
    ta.addEventListener('blur', () => {
      // Many libs mark touched/commit on blur+change
      inp.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Optional: Cmd/Ctrl+Enter to "commit" (mirrors enter on input)
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        syncToInput();
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // If input changes from elsewhere (React controlled), keep textarea in sync
    inp.addEventListener('input', syncFromInput);
    inp.addEventListener('change', syncFromInput);

    autosizeLater(ta);
    inp.dataset.__retellEnhanced = '1';
    return true;
  };

  const upgradeValues = (wrap) => {
    let added = 0;
    wrap.querySelectorAll('input[placeholder="Value"]').forEach(inp => { if (enhanceValueInput(inp)) added++; });
    if (added === 0) {
      // Fallback: try the 2nd column per row
      wrap.querySelectorAll('div.flex.flex-row.items-center.gap-1').forEach(row => {
        const group = row.querySelector(':scope > div.flex.flex-row.items-center.gap-2')
                   || row.querySelector(':scope > div.flex.flex-row');
        if (!group) return;
        const cols = group.querySelectorAll(':scope > .flex-1');
        if (cols.length >= 2) {
          const valInput = cols[1].querySelector('input');
          if (valInput) if (enhanceValueInput(valInput)) added++;
        }
      });
    }
    return added;
  };

  // ---- Apply everything ----
  const activeStyleObservers = new Set();

  const applyAll = () => {
    const wrappers = findPoppers();
    let rowsSized = 0, valuesAdded = 0, scrollersTouched = 0;

    // clear old observers
    activeStyleObservers.forEach(obs => obs.disconnect());
    activeStyleObservers.clear();

    wrappers.forEach(wrap => {
      // Force translateY=0 and keep enforcing on style rewrites
      forceTranslateY0(wrap);
      activeStyleObservers.add(attachStyleObserver(wrap));

      // Force dialog width inline (beats utilities)
      const dlg = wrap.querySelector('[role="dialog"]');
      if (dlg) {
        dlg.style.setProperty('width', `min(${DIALOG_MAX_WIDTH_PX}px,95vw)`, 'important');
        dlg.style.maxWidth = 'none';
      }

      sizeColumns(wrap);
      rowsSized += wrap.querySelectorAll('div.flex.flex-row.items-center.gap-1').length;

      scrollersTouched += growHeight(wrap);
      valuesAdded += upgradeValues(wrap);
    });

    console.log(`[retell-tweaks] wrappers: ${wrappers.length}, rows sized: ${rowsSized}, scrollers grown: ${scrollersTouched}, value textareas added: +${valuesAdded}`);
  };

  // Initial apply + re-apply on re-render (throttled)
  applyAll();
  let scheduled = false;
  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; applyAll(); });
  };
  const mo = new MutationObserver(() => scheduleApply());
  mo.observe(document.body, { childList:true, subtree:true });

  // Cleanup to revert quickly
  window.__retellTweaksCleanup = () => {
    mo.disconnect();
    activeStyleObservers.forEach(obs => obs.disconnect());
    activeStyleObservers.clear();
    document.getElementById(STYLE_ID)?.remove();

    document.querySelectorAll('textarea.__retell-bigedit').forEach(ta => {
      const input = ta.previousElementSibling;
      if (input && input.tagName === 'INPUT') {
        // restore original style and final value
        input.setAttribute('style', input.dataset.__retellPrevStyle || '');
        setNativeValue(input, ta.value);
        dispatchInput(input);
        input.removeAttribute('data-__retellPrevStyle');
        input.removeAttribute('data-__retellEnhanced');
      }
      ta.remove();
    });

    console.log('[retell-tweaks] cleaned up');
  };

  console.log('[retell-tweaks] applied. Adjust HEIGHT_VH / NAME_COL_PCT, and re-run to change. Use __retellTweaksCleanup() to undo.');
})();