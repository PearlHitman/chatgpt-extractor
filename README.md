# ChatGPT Conversation Extractor

A Tampermonkey userscript that exports your ChatGPT conversations as **JSON** and **Markdown** with one click — no Playwright, no CDP, no API keys, no Cloudflare fight.

Runs inside your already-authenticated browser session using the same endpoint the ChatGPT web app itself uses.

**Author:** Iraklis Sechou
**License:** MIT

---

## Vision

This project started as a simple ChatGPT exporter, but the goal is broader: **a universal conversation extractor for any LLM platform.**

AI conversations are valuable artifacts — for analysis, archival, fine-tuning datasets, knowledge bases, or just moving your data between tools. Every major LLM platform (ChatGPT, Claude, Gemini, Grok, Mistral, Perplexity, etc.) locks your conversations in a proprietary interface with no easy export. This project aims to fix that, one platform at a time.

**Planned platform support:**
- [x] ChatGPT (`chatgpt.com`)
- [ ] Claude (`claude.ai`)
- [ ] Gemini (`gemini.google.com`)
- [ ] Perplexity (`perplexity.ai`)
- [ ] Grok (`x.com/i/grok`)

Each platform gets its own extractor module following the same output schema — so your exports are always consistent JSON + Markdown regardless of source.

---

## Why this exists

ChatGPT's native export is a full-account email dump that takes hours to arrive. If you want a single conversation right now — for analysis, archival, or feeding into another tool — this does it instantly.

---

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari)
2. Drag `chatgpt-extractor.user.js` into your browser → click **Install**

---

## Use

1. Open any conversation on [chatgpt.com](https://chatgpt.com)
2. Click the green **⬇ Export** button (bottom-right corner)
3. Two files download instantly: `<title>_<id>.json` and `<title>_<id>.md`

---

## Output format

**JSON** — structured for programmatic use:
```json
{
  "meta": {
    "id": "abc-123",
    "title": "My conversation",
    "create_time": "2026-04-10T14:22:01.000Z",
    "exported_at": "2026-04-16T09:00:00.000Z",
    "source": "chatgpt-extractor"
  },
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "created_at": "2026-04-10T14:22:01.000Z",
      "model": null,
      "text": "..."
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "created_at": "2026-04-10T14:22:05.000Z",
      "model": "gpt-4o",
      "text": "..."
    }
  ]
}
```

**Markdown** — readable, with timestamps and role labels.

---

## Scope

- ✅ Linear visible thread (the conversation you see on screen)
- ✅ User + assistant messages
- ✅ Model slug per assistant message
- ✅ Timestamps
- ❌ Edited/regenerated branches (only current thread exported)
- ❌ Images / file attachments (metadata only)

---

## Safety & privacy

- **No external servers.** All data goes directly from ChatGPT's API to your local machine.
- **Auth token used only once** per export, only to call ChatGPT's own endpoint — never logged or transmitted elsewhere.
- **Read-only.** The script never writes, deletes, or modifies anything.
- **Open source.** Every line is auditable in `chatgpt-extractor.user.js`.

> **Note:** This accesses ChatGPT's internal undocumented API — the same one their own web app uses. It is not officially supported by OpenAI and technically falls in a ToS grey area. Use responsibly. Don't abuse rate limits.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "No conversation detected" | URL must contain `/c/<id>`. Open an actual conversation, not the home page |
| "API returned 401 / 403" | Session expired — refresh the page |
| "API returned 404" | Conversation deleted, not yours, or OpenAI changed the endpoint |
| Button doesn't appear | Check Tampermonkey is enabled. Open DevTools console, look for `[ChatGPT Extractor]` errors |

---

## Known limitations

- ChatGPT's internal API is undocumented and can change without notice. If a future update breaks this, the fix is usually a one-line change in `fetchConversation` or `extractLinearThread`.
- Works on `chatgpt.com`. The old `chat.openai.com` domain is matched but now redirects.

---

## Roadmap

- [ ] Claude.ai extractor module
- [ ] Gemini extractor module
- [ ] Bulk export (all conversations)
- [ ] Branch extraction (edited/regenerated messages)
- [ ] Attachment/image metadata download
- [ ] Format plugins (CSV, Notion, Obsidian)

---

## Contributing

PRs welcome. If you're adding a new platform, follow the same output schema so exports stay consistent across sources.
