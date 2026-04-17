// ==UserScript==
// @name         GitHub PR Sticky Repo Pill
// @namespace    http://tampermonkey.net/
// @version      2026-01-18.5
// @description  On GitHub PR pages, show the current repo name as a State pill beside the sticky header State pill, styled as closed.
// @match        https://github.com/*/*/pull/*
// @match        https://github.com/*/*/pulls/*
// @run-at       document-idle
// @grant        none
// @icon         https://github.githubassets.com/favicons/favicon-dark.png
// @downloadURL  https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/github/sticky_repo_pill.js
// @updateURL    https://raw.githubusercontent.com/Med-Calls-AI/medcalls-tamper-monkeys/refs/heads/master/monkeys/github/sticky_repo_pill.js
// ==/UserScript==

(function () {
    'use strict';

    const REPO_PILL_ID = 'tm-repo-state-pill';

    function getRepoName() {
      // Prefer GitHub's AppHeader repo crumb label if present
      const crumbLabel =
        document.querySelector(
          'context-region-crumb[data-crumb-id^="contextregion-repositorycrumb-"] [data-target="context-region-crumb.labelElement"]'
        ) ||
        document.querySelector(
          'context-region-crumb[data-crumb-id^="contextregion-repositorycrumb-"] .AppHeader-context-item-label'
        );

      const fromCrumb = crumbLabel?.textContent?.trim();
      if (fromCrumb) return fromCrumb;

      // Fallback: parse /OWNER/REPO from the URL
      const parts = location.pathname.split('/').filter(Boolean);
      return parts.length >= 2 ? parts[1] : null;
    }

    function findInsertionPoint() {
      const sticky = document.querySelector('.sticky-header-container');
      if (!sticky) return null;

      // Wrapper that contains the State pill (Open/Closed/Merged)
      const wrapper =
        sticky.querySelector('.mr-2.mb-1.flex-shrink-0') ||
        sticky.querySelector('.sticky-content .State')?.parentElement;

      if (!wrapper) return null;

      const statePill = wrapper.querySelector('span.State');
      if (!statePill) return null;

      return { wrapper, statePill };
    }

    function upsertRepoPill() {
      const repoName = getRepoName();
      if (!repoName) return false;

      const insertion = findInsertionPoint();
      if (!insertion) return false;

      const { wrapper, statePill } = insertion;

      let repoPill = document.getElementById(REPO_PILL_ID);
      if (!repoPill) {
        repoPill = document.createElement('span');
        repoPill.id = REPO_PILL_ID;

        // Force "closed" styling, per your request.
        repoPill.className = 'State';
        repoPill.setAttribute('data-view-component', 'true');

        // Insert immediately beside the existing State pill.
        wrapper.insertBefore(repoPill, statePill.nextSibling);
      }

      // Keep it as plain text (like your example).
      repoPill.textContent = repoName;

      return true;
    }

    // Bounded retry loop (GitHub can hydrate sticky header after document-idle)
    function installWithRetry() {
      let attempts = 0;
      const maxAttempts = 60; // ~6 seconds at 100ms
      const timer = setInterval(() => {
        attempts += 1;
        const ok = upsertRepoPill();
        if (ok || attempts >= maxAttempts) clearInterval(timer);
      }, 100);
    }

    // Initial + soft navigation hooks
    installWithRetry();
    document.addEventListener('turbo:load', installWithRetry, true);
    document.addEventListener('turbo:render', installWithRetry, true);
    document.addEventListener('pjax:end', installWithRetry, true);
    window.addEventListener('popstate', installWithRetry, true);
  })();