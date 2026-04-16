// ==UserScript==
// @name         Claude Conversation Extractor
// @namespace    https://github.com/PearlHitman/chatgpt-extractor
// @version      0.1.0
// @description  Export the current Claude conversation as JSON and Markdown. DOM-based.
// @author       Iraklis Sechou
// @match        https://claude.ai/chat/*
// @match        https://claude.ai/conversation/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ---------- Config ----------
    const BUTTON_ID = 'claude-extractor-btn';
    const RATE_LIMIT_MS = 5000;
    let lastExportTime = 0;

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
            background: '#cc785c',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        });
        btn.addEventListener('mouseenter', () => { btn.style.background = '#b5623a'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = '#cc785c'; });
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

    // ---------- Scroll to load all messages ----------
    function findScrollContainer() {
        // Claude renders conversation in a scrollable div inside main
        const candidates = [
            document.querySelector('[class*="conversation-content"]'),
            document.querySelector('[class*="chat-content"]'),
            document.querySelector('main [class*="overflow"]'),
            document.querySelector('main'),
            document.scrollingElement,
            document.body,
        ];
        return candidates.find(Boolean);
    }

    async function scrollToTop(container) {
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
        container.scrollTop = container.scrollHeight;
        await sleep(200);
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ---------- Extraction ----------
    function extractMessages() {
        // Strategy 1: data-testid attributes (most stable)
        let userEls = document.querySelectorAll('[data-testid="user-message"]');
        let assistantEls = document.querySelectorAll('[data-testid="assistant-message"]');

        if (userEls.length > 0 || assistantEls.length > 0) {
            return extractByTestId(userEls, assistantEls);
        }

        // Strategy 2: walk DOM looking for human/assistant turn containers
        return extractByDOMWalk();
    }

    function extractByTestId(userEls, assistantEls) {
        // Build a combined list ordered by DOM position
        const all = [];

        userEls.forEach(el => all.push({ el, role: 'user' }));
        assistantEls.forEach(el => all.push({ el, role: 'assistant' }));

        // Sort by DOM order
        all.sort((a, b) => {
            const pos = a.el.compareDocumentPosition(b.el);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        return all
            .map((item, idx) => ({
                index: idx,
                role: item.role,
                text: cleanText(item.el.innerText || item.el.textContent || ''),
                html: item.el.innerHTML || '',
            }))
            .filter(m => m.text.length > 0);
    }

    function extractByDOMWalk() {
        const messages = [];

        // Claude wraps each turn in a container — look for alternating human/AI blocks
        const selectors = [
            // Common Claude class patterns
            '[class*="human-turn"]',
            '[class*="HumanTurn"]',
            '[class*="human_turn"]',
            '[class*="ConversationTurn"]',
            '[class*="conversation-turn"]',
        ];

        let turns = [];
        for (const sel of selectors) {
            turns = Array.from(document.querySelectorAll(sel));
            if (turns.length > 0) break;
        }

        if (turns.length === 0) {
            // Last resort: grab all text blocks in main
            turns = Array.from(document.querySelectorAll('main p, main [class*="prose"]'));
        }

        turns.forEach((el, idx) => {
            const text = cleanText(el.innerText || el.textContent || '');
            if (!text) return;
            const cls = (el.className || '').toString().toLowerCase();
            const isUser = cls.includes('human') || cls.includes('user');
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

    // ---------- Metadata ----------
    function getConversationId() {
        const m = window.location.pathname.match(/\/(chat|conversation)\/([a-f0-9-]+)/i);
        return m ? m[2] : 'unknown';
    }

    function getTitle() {
        // Active conversation in sidebar
        const active = document.querySelector('[aria-current="page"], [class*="active"] [class*="title"], [class*="selected"] [class*="title"]');
        if (active) {
            const t = cleanText(active.innerText || active.textContent || '');
            if (t && t.length > 0 && t.length < 200) return t;
        }
        return document.title.replace(/ [–\-|].*$/, '').replace(/Claude$/, '').trim() || 'Claude Conversation';
    }

    // ---------- Output ----------
    function toMarkdown(meta, messages) {
        const lines = [];
        lines.push(`# ${meta.title}`);
        lines.push('');
        lines.push(`- **Source:** Claude`);
        lines.push(`- **Conversation ID:** ${meta.id}`);
        lines.push(`- **Exported:** ${meta.exported_at}`);
        lines.push(`- **Message count:** ${messages.length}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        for (const msg of messages) {
            const label = msg.role === 'user' ? '🧑 **User**' : '🤖 **Claude**';
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
        const now = Date.now();
        if (now - lastExportTime < RATE_LIMIT_MS) {
            const wait = Math.ceil((RATE_LIMIT_MS - (now - lastExportTime)) / 1000);
            alert(`Please wait ${wait}s before exporting again.`);
            return;
        }

        setButtonState('⏳ Loading all messages...', true);
        try {
            const container = findScrollContainer();
            await scrollToTop(container);

            setButtonState('⏳ Extracting...', true);
            const messages = extractMessages();

            if (messages.length === 0) {
                throw new Error('No messages found. Claude may have updated its DOM — please open an issue on GitHub.');
            }

            const title = getTitle();
            const id = getConversationId();
            const meta = {
                source: 'claude',
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

            lastExportTime = Date.now();
            setButtonState(`✅ ${messages.length} messages`, false);
            setTimeout(() => setButtonState('⬇ Export', false), 2500);
        } catch (err) {
            console.error('[Claude Extractor]', err);
            alert('Export failed: ' + err.message);
            setButtonState('⬇ Export', false);
        }
    }

    // ---------- Bootstrap ----------
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton();
})();
