// ==UserScript==
// @name         Reddit Feed Organizer - Lightweight
// @namespace    https://github.com/Danikika94/reddit-feed-organizer
// @version      1.1.4
// @description  Organize Reddit feed listings into All Posts, SFW and NSFW tabs. SFW is shown by default.
// @author       Danikika94
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        defaultTab: 'sfw',
        showCounts: true,
        sticky: true
    };

    const TOOLBAR_ID = 'reddit-feed-organizer';
    const STYLE_ID = 'reddit-feed-organizer-style';
    const POST_SELECTOR =
        'shreddit-post, article[data-testid="post-container"], .thing.link';

    let activeTab = CONFIG.defaultTab;
    let feedObserver = null;
    let pendingFeedObserver = null;
    let isRunning = false;
    let lastRouteKey = getRouteKey();

    const classifications = new WeakMap();
    const activePosts = new Map();
    const counts = { all: 0, sfw: 0, nsfw: 0 };

    // Individual post pages must never be modified by this userscript.
    function isFeedPage() {
        const path = window.location.pathname;

        if (/\/comments(?:\/|$)/i.test(path)) return false;

        return path === '/' ||
            /^\/(?:r|user|u)\/[^/]+(?:\/|$)/i.test(path) ||
            /^\/(?:search|best|hot|new|top|popular|all)(?:\/|$)/i.test(path);
    }

    function getRouteKey() {
        return window.location.pathname + window.location.search + window.location.hash;
    }

    // Prefer Reddit's actual feed containers. Avoid using a generic <main>
    // element, which can belong to an individual post page during navigation.
    function findFeedRoot() {
        const modernFeed = document.querySelector('shreddit-feed');
        if (modernFeed) return modernFeed;

        const oldFeed = document.querySelector('#siteTable, .sitetable.linklisting');
        if (oldFeed && oldFeed.querySelector(POST_SELECTOR)) return oldFeed;

        const testIdFeed = document.querySelector('[data-testid="posts-list"]');
        if (testIdFeed && testIdFeed.querySelector(POST_SELECTOR)) return testIdFeed;

        // Fallback for Reddit layouts without a named feed wrapper.
        // Requiring multiple posts helps avoid mistaking a stale post-detail
        // layout for the destination feed during client-side navigation.
        const main = document.querySelector('main');
        if (main && main.querySelectorAll(POST_SELECTOR).length > 1) return main;

        return null;
    }

    function addStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '#reddit-feed-organizer {',
            '  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;',
            '  padding: 12px 16px; margin: 12px auto; max-width: 1100px;',
            '  background: var(--color-neutral-background, #1a1a1b);',
            '  border: 1px solid var(--color-neutral-border, #343536);',
            '  border-radius: 12px; z-index: 100;',
            '}',
            '#reddit-feed-organizer.rfo-sticky { position: sticky; top: 60px; }',
            '#reddit-feed-organizer .rfo-label { font-weight: 700; margin-right: 10px; }',
            '#reddit-feed-organizer button {',
            '  display: inline-flex; align-items: center; justify-content: center;',
            '  vertical-align: middle; box-sizing: border-box; line-height: 1;',
            '  cursor: pointer; padding: 9px 18px; border-radius: 20px;',
            '  border: 1px solid var(--color-neutral-border, #555);',
            '  background: transparent; color: var(--color-neutral-content, inherit);',
            '  font-size: 14px; font-weight: 600; text-align: center;',
            '}',
            '#reddit-feed-organizer button .rfo-count {',
            '  display: inline-flex; align-items: center; line-height: 1;',
            '}',
            '#reddit-feed-organizer button.active {',
            '  background: #d93900; color: white; border-color: #d93900;',
            '}',
            '#reddit-feed-organizer .rfo-count { margin-left: 5px; opacity: 0.8; }',
            '.rfo-hidden { display: none !important; }'
        ].join('\n');

        document.head.appendChild(style);
    }

    function collectPosts(root) {
        const found = new Set();

        if (
            !root ||
            (root.nodeType !== Node.ELEMENT_NODE &&
             root.nodeType !== Node.DOCUMENT_NODE &&
             root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)
        ) return found;

        if (root.nodeType === Node.ELEMENT_NODE && root.matches(POST_SELECTOR)) {
            found.add(root);
        }

        if (root.querySelectorAll) {
            root.querySelectorAll(POST_SELECTOR).forEach(post => found.add(post));
        }

        for (const post of found) {
            if (post.tagName === 'ARTICLE' && post.querySelector('shreddit-post')) {
                found.delete(post);
            }
        }

        return found;
    }

    function isNSFW(post) {
        for (const attribute of ['nsfw', 'is-nsfw', 'data-nsfw']) {
            if (post.hasAttribute(attribute)) {
                const value = post.getAttribute(attribute);
                if (value !== 'false' && value !== '0') return true;
            }
        }

        if (post.querySelector('.nsfw-stamp')) return true;

        const flairElements = post.querySelectorAll(
            '[slot="post-flair"], [data-testid="post-flair"], .flair'
        );

        for (const element of flairElements) {
            if (/\bNSFW\b|\b18\+\b/i.test(element.textContent)) return true;
        }

        return false;
    }

    function updateVisibility(post, nsfw) {
        const hidden =
            (activeTab === 'sfw' && nsfw) ||
            (activeTab === 'nsfw' && !nsfw);

        post.classList.toggle('rfo-hidden', hidden);
    }

    function updateAllVisibility() {
        activePosts.forEach((nsfw, post) => updateVisibility(post, nsfw));
    }

    function addPost(post) {
        if (activePosts.has(post)) return;

        let nsfw = classifications.get(post);
        if (nsfw === undefined) {
            nsfw = isNSFW(post);
            classifications.set(post, nsfw);
        }

        activePosts.set(post, nsfw);
        counts.all++;
        if (nsfw) counts.nsfw++;
        else counts.sfw++;

        updateVisibility(post, nsfw);
    }

    function removePost(post) {
        if (!activePosts.has(post)) return;

        const nsfw = activePosts.get(post);
        activePosts.delete(post);
        counts.all--;
        if (nsfw) counts.nsfw--;
        else counts.sfw--;
    }

    function updateCounts() {
        const toolbar = document.getElementById(TOOLBAR_ID);
        if (!toolbar) return;

        toolbar.querySelectorAll('[data-count]').forEach(element => {
            element.textContent = '(' + counts[element.dataset.count] + ')';
        });

        toolbar.querySelectorAll('button[data-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === activeTab);
        });
    }

    function createToolbar() {
        const existing = document.getElementById(TOOLBAR_ID);
        if (existing) return true;

        const feed = findFeedRoot();
        if (!feed) return false;

        const toolbar = document.createElement('div');
        toolbar.id = TOOLBAR_ID;
        if (CONFIG.sticky) toolbar.classList.add('rfo-sticky');

        const label = document.createElement('span');
        label.className = 'rfo-label';
        label.textContent = 'Feed Organizer';
        toolbar.appendChild(label);

        [
            { id: 'all', label: 'All Posts' },
            { id: 'sfw', label: 'SFW' },
            { id: 'nsfw', label: 'NSFW' }
        ].forEach(tab => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.tab = tab.id;
            button.textContent = tab.label;

            if (CONFIG.showCounts) {
                const count = document.createElement('span');
                count.className = 'rfo-count';
                count.dataset.count = tab.id;
                button.appendChild(count);
            }

            button.addEventListener('click', () => {
                if (activeTab === tab.id) return;
                activeTab = tab.id;
                updateAllVisibility();
                updateCounts();
            });

            toolbar.appendChild(button);
        });

        if (feed.tagName === 'SHREDDIT-FEED' ||
            feed.id === 'siteTable' ||
            feed.classList.contains('sitetable') ||
            feed.dataset.testid === 'posts-list') {
            feed.parentNode.insertBefore(toolbar, feed);
        } else {
            feed.insertBefore(toolbar, feed.firstChild);
        }

        updateCounts();
        return true;
    }

    function resetCounts() {
        counts.all = 0;
        counts.sfw = 0;
        counts.nsfw = 0;
    }

    function disconnectPendingFeedObserver() {
        if (pendingFeedObserver) {
            pendingFeedObserver.disconnect();
            pendingFeedObserver = null;
        }
    }

    function cleanupRuntime() {
        if (feedObserver) {
            feedObserver.disconnect();
            feedObserver = null;
        }

        disconnectPendingFeedObserver();

        // Always restore posts before removing the filtering stylesheet.
        activePosts.forEach((_nsfw, post) => post.classList.remove('rfo-hidden'));
        activePosts.clear();
        resetCounts();

        document.getElementById(TOOLBAR_ID)?.remove();
        document.getElementById(STYLE_ID)?.remove();
        isRunning = false;
    }

    function processMutations(mutations) {
        let changed = false;

        for (const mutation of mutations) {
            mutation.removedNodes.forEach(node => {
                collectPosts(node).forEach(post => {
                    removePost(post);
                    changed = true;
                });
            });

            mutation.addedNodes.forEach(node => {
                collectPosts(node).forEach(post => {
                    addPost(post);
                    changed = true;
                });
            });
        }

        if (!document.getElementById(TOOLBAR_ID)) createToolbar();
        if (changed) updateCounts();
    }

    function startOnFeedPage() {
        if (!isFeedPage() || isRunning) return isRunning;

        const feed = findFeedRoot();
        if (!feed) return false;

        isRunning = true;
        activeTab = CONFIG.defaultTab;
        addStyles();

        if (!createToolbar()) {
            isRunning = false;
            return false;
        }

        collectPosts(feed).forEach(addPost);
        updateAllVisibility();
        updateCounts();

        feedObserver = new MutationObserver(mutations => {
            // The URL may change before Reddit finishes replacing the feed DOM.
            checkRouteChange();
            if (!isFeedPage()) return;
            if (!isRunning) {
                waitForFeedAndStart();
                return;
            }
            processMutations(mutations);
        });

        // Observe the document element rather than body so React/Reddit can
        // replace the body subtree without disconnecting the observer.
        feedObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        return true;
    }

    function waitForFeedAndStart() {
        if (!isFeedPage()) return;

        if (startOnFeedPage()) {
            disconnectPendingFeedObserver();
            return;
        }

        if (pendingFeedObserver) return;

        pendingFeedObserver = new MutationObserver(() => {
            checkRouteChange();
            if (!isFeedPage()) {
                disconnectPendingFeedObserver();
                return;
            }

            if (startOnFeedPage()) disconnectPendingFeedObserver();
        });

        pendingFeedObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function handleRouteChange() {
        cleanupRuntime();

        if (isFeedPage()) {
            waitForFeedAndStart();
        }
    }

    function checkRouteChange() {
        const nextRouteKey = getRouteKey();

        if (nextRouteKey !== lastRouteKey) {
            lastRouteKey = nextRouteKey;
            handleRouteChange();
            return;
        }

        // Allows a delayed Reddit feed render to initialize even when the URL
        // was already updated before the destination DOM became available.
        if (isFeedPage() && !isRunning) waitForFeedAndStart();
    }

    function scheduleRouteChecks() {
        // Reddit may update the URL and render the destination at different
        // moments. These few checks are only scheduled after navigation input.
        [0, 80, 250, 650].forEach(delay => {
            window.setTimeout(checkRouteChange, delay);
        });
    }

    function onDocumentClick(event) {
        const path = typeof event.composedPath === 'function'
            ? event.composedPath()
            : [event.target];

        let link = path.find(node =>
            node instanceof HTMLAnchorElement && node.href
        );

        if (!link && event.target instanceof Element) {
            link = event.target.closest('a[href]');
        }

        if (!link) return;

        try {
            const destination = new URL(link.href, window.location.href);
            if (destination.origin === window.location.origin) {
                scheduleRouteChecks();
            }
        } catch (_error) {
            // Ignore malformed or non-standard links.
        }
    }

    // Supplement History API hooks with navigation and click detection.
    // This is important on post pages, where the feed observer is not running.
    function patchHistoryMethod(methodName) {
        try {
            const original = window.history[methodName];
            if (typeof original !== 'function' || original.__rfoWrapped) return;

            const wrapped = function () {
                const result = original.apply(this, arguments);
                scheduleRouteChecks();
                return result;
            };

            Object.defineProperty(wrapped, '__rfoWrapped', { value: true });
            window.history[methodName] = wrapped;
        } catch (_error) {
            // Click, Navigation API and popstate listeners remain as fallbacks.
        }
    }

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');

    document.addEventListener('click', onDocumentClick, true);
    window.addEventListener('popstate', scheduleRouteChecks);
    window.addEventListener('hashchange', scheduleRouteChecks);
    window.addEventListener('pageshow', scheduleRouteChecks);

    if (window.navigation &&
        typeof window.navigation.addEventListener === 'function') {
        window.navigation.addEventListener('navigate', scheduleRouteChecks);
    }

    if (isFeedPage()) waitForFeedAndStart();
})();
