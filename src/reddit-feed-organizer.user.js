// ==UserScript==
// @name         Reddit Feed Organizer - Lightweight
// @namespace    https://github.com/Danikika94/reddit-feed-organizer
// @version      1.1.3
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
    let observer = null;
    let isRunning = false;

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

    function addStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${TOOLBAR_ID} {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                padding: 12px 16px;
                margin: 12px auto;
                max-width: 1100px;
                background: var(--color-neutral-background, #1a1a1b);
                border: 1px solid var(--color-neutral-border, #343536);
                border-radius: 12px;
                z-index: 100;
            }
            #${TOOLBAR_ID}.rfo-sticky { position: sticky; top: 60px; }
            #${TOOLBAR_ID} .rfo-label { font-weight: 700; margin-right: 10px; }
            #${TOOLBAR_ID} button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                vertical-align: middle;
                box-sizing: border-box;
                line-height: 1;
                cursor: pointer;
                padding: 9px 18px;
                border-radius: 20px;
                border: 1px solid var(--color-neutral-border, #555);
                background: transparent;
                color: var(--color-neutral-content, inherit);
                font-size: 14px;
                font-weight: 600;
                text-align: center;
            }
            #${TOOLBAR_ID} button .rfo-count {
                display: inline-flex;
                align-items: center;
                line-height: 1;
            }
            #${TOOLBAR_ID} button.active {
                background: #d93900; color: white; border-color: #d93900;
            }
            #${TOOLBAR_ID} .rfo-count { margin-left: 5px; opacity: 0.8; }
            .rfo-hidden { display: none !important; }
        `;

        document.head.appendChild(style);
    }

    function collectPosts(root) {
        const found = new Set();

        if (
            root.nodeType !== Node.ELEMENT_NODE &&
            root.nodeType !== Node.DOCUMENT_NODE &&
            root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
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
            element.textContent = `(${counts[element.dataset.count]})`;
        });

        toolbar.querySelectorAll('button[data-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === activeTab);
        });
    }

    function createToolbar() {
        if (document.getElementById(TOOLBAR_ID)) return true;

        const feed = document.querySelector('shreddit-feed') ||
                     document.querySelector('main');

        // Do not inject the toolbar into arbitrary pages or the document body.
        if (!feed || !feed.parentNode) return false;

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

        feed.parentNode.insertBefore(toolbar, feed);
        updateCounts();
        return true;
    }

    function resetCounts() {
        counts.all = 0;
        counts.sfw = 0;
        counts.nsfw = 0;
    }

    function stopOnNonFeedPage() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        activePosts.forEach((_nsfw, post) => post.classList.remove('rfo-hidden'));
        activePosts.clear();
        resetCounts();

        document.getElementById(TOOLBAR_ID)?.remove();
        document.getElementById(STYLE_ID)?.remove();
        isRunning = false;
    }

    function startOnFeedPage() {
        if (!isFeedPage()) {
            stopOnNonFeedPage();
            return;
        }

        if (!isRunning) {
            isRunning = true;
            activeTab = CONFIG.defaultTab;
            addStyles();
            createToolbar();

            observer = new MutationObserver(mutations => {
                if (!isFeedPage()) {
                    stopOnNonFeedPage();
                    return;
                }

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
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } else {
            createToolbar();
        }

        collectPosts(document).forEach(addPost);
        updateAllVisibility();
        updateCounts();
    }

    // Reddit is a single-page app. Re-check the URL after client-side navigation.
    function handleRouteChange() {
        startOnFeedPage();
    }

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
        const result = originalPushState.apply(this, args);
        Promise.resolve().then(handleRouteChange);
        return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
        const result = originalReplaceState.apply(this, args);
        Promise.resolve().then(handleRouteChange);
        return result;
    };

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);

    startOnFeedPage();
})();
