// ==UserScript==
// @name         ChatGPT Conversation Extractor
// @namespace    https://github.com/iraklis/chatgpt-extractor
// @version      1.0.0
// @description  Export the current ChatGPT conversation as JSON and Markdown. Linear thread (visible messages only).
// @author       Iraklis
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ---------- Config ----------
    const BUTTON_ID = 'chatgpt-extractor-btn';
    const API_BASE = '/backend-api/conversation';
    const RATE_LIMIT_MS = 5000; // min ms between exports
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
            background: '#10a37f',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        });

        btn.addEventListener('mouseenter', () => { btn.style.background = '#0d8a6b'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = '#10a37f'; });
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

    // ---------- Core ----------
    function getConversationId() {
        const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
        return match ? match[1] : null;
    }

    async function getAuthToken() {
        const res = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
        if (!res.ok) throw new Error('Could not fetch session. Are you logged in?');
        const data = await res.json();
        return data.accessToken || null;
    }

    async function fetchConversation(id) {
        const token = await getAuthToken();
        const headers = { 'Accept': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/${id}`, {
            credentials: 'include',
            headers,
        });
        if (!res.ok) {
            throw new Error(`API returned ${res.status}. Are you logged in and on a conversation page?`);
        }
        return res.json();
    }

    // Walk the mapping tree from current_node backwards to root, then reverse.
    // This gives the visible linear thread.
    function extractLinearThread(data) {
        const { mapping, current_node } = data;
        if (!mapping || !current_node) throw new Error('Unexpected API response shape.');

        const chain = [];
        let nodeId = current_node;
        while (nodeId) {
            const node = mapping[nodeId];
            if (!node) break;
            chain.push(node);
            nodeId = node.parent;
        }
        chain.reverse();

        // Filter: keep only nodes with user-visible content
        return chain
            .filter(n => n.message)
            .filter(n => {
                const m = n.message;
                const role = m.author?.role;
                if (!role || role === 'system') return false;
                // Skip tool noise unless it has meaningful content
                if (role === 'tool') return false;
                const parts = m.content?.parts;
                if (!parts || parts.length === 0) return false;
                const text = parts.map(p => typeof p === 'string' ? p : '').join('').trim();
                return text.length > 0;
            })
            .map(n => {
                const m = n.message;
                const parts = m.content?.parts || [];
                const text = parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
                return {
                    id: m.id,
                    role: m.author?.role || 'unknown',
                    created_at: m.create_time ? new Date(m.create_time * 1000).toISOString() : null,
                    model: m.metadata?.model_slug || null,
                    text,
                };
            });
    }

    function toMarkdown(meta, messages) {
        const lines = [];
        lines.push(`# ${meta.title || 'ChatGPT Conversation'}`);
        lines.push('');
        lines.push(`- **Conversation ID:** ${meta.id}`);
        lines.push(`- **Created:** ${meta.create_time}`);
        lines.push(`- **Exported:** ${new Date().toISOString()}`);
        lines.push(`- **Message count:** ${messages.length}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        for (const msg of messages) {
            const roleLabel = msg.role === 'user' ? '🧑 **User**' : msg.role === 'assistant' ? '🤖 **ChatGPT**' : `**${msg.role}**`;
            const timestamp = msg.created_at ? ` — *${msg.created_at}*` : '';
            lines.push(`## ${roleLabel}${timestamp}`);
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

    async function onExportClick() {
        const now = Date.now();
        if (now - lastExportTime < RATE_LIMIT_MS) {
            const wait = Math.ceil((RATE_LIMIT_MS - (now - lastExportTime)) / 1000);
            alert(`Please wait ${wait}s before exporting again.`);
            return;
        }

        const id = getConversationId();
        if (!id) {
            alert('No conversation detected. Open a conversation first (URL must contain /c/<id>).');
            return;
        }

        setButtonState('⏳ Fetching...', true);
        try {
            const raw = await fetchConversation(id);
            const messages = extractLinearThread(raw);

            const meta = {
                id,
                title: raw.title,
                create_time: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : null,
            };

            const base = safeFilename(raw.title) + '_' + id.slice(0, 8);

            const jsonPayload = {
                meta: { ...meta, exported_at: new Date().toISOString(), source: 'chatgpt-extractor' },
                messages,
            };

            download(`${base}.json`, JSON.stringify(jsonPayload, null, 2), 'application/json');
            download(`${base}.md`, toMarkdown(meta, messages), 'text/markdown');

            lastExportTime = Date.now();
            setButtonState('✅ Done', false);
            setTimeout(() => setButtonState('⬇ Export', false), 2000);
        } catch (err) {
            console.error('[ChatGPT Extractor]', err);
            alert('Export failed: ' + err.message);
            setButtonState('⬇ Export', false);
        }
    }

    // ---------- Bootstrap ----------
    // ChatGPT is an SPA — re-inject on route changes
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton();
})();
