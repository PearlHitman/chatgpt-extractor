// ==UserScript==
// @name         Gemini Conversation Extractor
// @namespace    https://github.com/PearlHitman/chatgpt-extractor
// @version      0.1.0
// @description  Export the current Gemini conversation as JSON and Markdown. DOM-based (Gemini has no public conversation API).
// @author       Iraklis
// @match        https://gemini.google.com/app/*
// @match        https://gemini.google.com/app
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ---------- Config ----------
    // If Gemini updates its DOM, these are the first things to check/update.
    const BUTTON_ID = 'gemini-extractor-btn';
    const SELECTORS = {
        // Container that holds the scrolling conversation
        scrollContainer: 'infinite-scroller, [data-test-id="chat-history-container"], main',
        // Each user+model turn pair
        conversationTurn: 'user-query, model-response, [data-test-id="conversation"]',
        userTurn: 'user-query',
        modelTurn: 'model-response',
        // Inside each turn, the actual rendered content
        userContent: '.query-text, user-query-content, [data-test-id="query-text"]',
        modelContent: 'message-content, .model-response-text, [data-test-id="response"]',
    };

    // ---------- UI ----------
    function injectButton() {
        if (document.getElementById(BUTTON_ID)) return;

        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.textContent = '⬇ Export';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '999999',
            padding: '10px 16px',
            background: '#1a73e8',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        });
        btn.addEventListener('mouseenter', () => { btn.style.background = '#1557b0'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = '#1a73e8'; });
        btn.addEventListener('click', onExportClick);

        document.body.appendChild(btn);
    }

    function setButtonState(text, disabled = false) {
        const btn = document.getElementById(BUTTON_ID);
        if (!btn) return;
        btn.textContent = text;
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.6' : '1';
    }

    // ---------- Scroll to force-load all messages ----------
    function findScrollContainer() {
        const selectors = SELECTORS.scrollContainer.split(',').map(s => s.trim());
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return document.scrollingElement || document.body;
    }

    async function scrollToTop(container) {
        // Repeatedly scroll to top until no more messages load
        let lastHeight = -1;
        let stableCount = 0;
        const maxIterations = 30;

        for (let i = 0; i < maxIterations; i++) {
            container.scrollTop = 0;
            await sleep(400);
            const currentHeight = container.scrollHeight;
            if (currentHeight === lastHeight) {
                stableCount++;
                if (stableCount >= 2) break;
            } else {
                stableCount = 0;
            }
            lastHeight = currentHeight;
        }
        // Scroll back down so user isn't disoriented
        container.scrollTop = container.scrollHeight;
        await sleep(200);
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ---------- Extraction ----------
    function extractMessages() {
        const messages = [];

        // Strategy: walk the DOM in document order, pick up user queries and model responses
        // Gemini uses custom elements <user-query> and <model-response>
        const allTurns = document.querySelectorAll('user-query, model-response');

        if (allTurns.length === 0) {
            // Fallback: try more generic selectors
            return extractMessagesFallback();
        }

        allTurns.forEach((turn, idx) => {
            const tag = turn.tagName.toLowerCase();
            if (tag === 'user-query') {
                const textEl = turn.querySelector('.query-text, user-query-content') || turn;
                messages.push({
                    index: idx,
                    role: 'user',
                    text: cleanText(textEl.innerText || textEl.textContent || ''),
                    html: textEl.innerHTML || '',
                });
            } else if (tag === 'model-response') {
                const textEl = turn.querySelector('message-content, .model-response-text') || turn;
                messages.push({
                    index: idx,
                    role: 'assistant',
                    text: cleanText(textEl.innerText || textEl.textContent || ''),
                    html: textEl.innerHTML || '',
                });
            }
        });

        return messages.filter(m => m.text.length > 0);
    }

    function extractMessagesFallback() {
        // Generic fallback — captures anything that looks like a conversation turn
        const messages = [];
        const candidates = document.querySelectorAll('[data-test-id*="conversation"], [class*="conversation-turn"], [class*="message-"]');

        candidates.forEach((el, idx) => {
            const text = cleanText(el.innerText || el.textContent || '');
            if (!text) return;

            // Heuristic role detection
            const className = (el.className || '').toString().toLowerCase();
            const isUser = className.includes('user') || className.includes('query');
            messages.push({
                index: idx,
                role: isUser ? 'user' : 'assistant',
                text,
                html: el.innerHTML || '',
            });
        });

        return messages;
    }

    function cleanText(s) {
        return (s || '')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // ---------- Output formatting ----------
    function getConversationId() {
        const m = window.location.pathname.match(/\/app\/([a-f0-9]+)/i);
        return m ? m[1] : 'unknown';
    }

    function getTitle() {
        // Try to grab the conversation title from the sidebar (active item)
        const activeTitle = document.querySelector('[aria-current="page"], .conversation.selected, [class*="selected"] [class*="title"]');
        if (activeTitle) {
            const t = cleanText(activeTitle.innerText || activeTitle.textContent || '');
            if (t) return t;
        }
        return document.title.replace(/ - Gemini$/, '').trim() || 'Gemini Conversation';
    }

    function toMarkdown(meta, messages) {
        const lines = [];
        lines.push(`# ${meta.title}`);
        lines.push('');
        lines.push(`- **Source:** Gemini`);
        lines.push(`- **Conversation ID:** ${meta.id}`);
        lines.push(`- **Exported:** ${meta.exported_at}`);
        lines.push(`- **Message count:** ${messages.length}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        for (const msg of messages) {
            const label = msg.role === 'user' ? '🧑 **User**' : '✨ **Gemini**';
            lines.push(`## ${label}`);
            lines.push('');
            lines.push(msg.text);
            lines.push('');
            lines.push('---');
            lines.push('');
        }
        return lines.join('\n');
    }

    function download(filename, content, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function safeFilename(s) {
        return (s || 'conversation')
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 80);
    }

    // ---------- Main ----------
    async function onExportClick() {
        setButtonState('⏳ Loading all messages...', true);
        try {
            const container = findScrollContainer();
            await scrollToTop(container);

            setButtonState('⏳ Extracting...', true);
            const messages = extractMessages();

            if (messages.length === 0) {
                throw new Error('No messages found. Gemini may have updated its DOM — please open an issue.');
            }

            const title = getTitle();
            const id = getConversationId();
            const meta = {
                source: 'gemini',
                id,
                title,
                url: window.location.href,
                exported_at: new Date().toISOString(),
                exporter_version: '0.1.0',
            };

            const base = safeFilename(title) + '_' + id.slice(0, 8);

            const jsonPayload = { meta, messages };
            download(`${base}.json`, JSON.stringify(jsonPayload, null, 2), 'application/json');
            download(`${base}.md`, toMarkdown(meta, messages), 'text/markdown');

            setButtonState(`✅ ${messages.length} messages`, false);
            setTimeout(() => setButtonState('⬇ Export', false), 2500);
        } catch (err) {
            console.error('[Gemini Extractor]', err);
            alert('Export failed: ' + err.message);
            setButtonState('⬇ Export', false);
        }
    }

    // ---------- Bootstrap ----------
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton();
})();
