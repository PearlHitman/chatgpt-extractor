# ChatGPT Conversation Extractor

A Tampermonkey userscript that exports your ChatGPT conversations as **JSON** and **Markdown** with one click.

No Playwright. No CDP. No API keys. No Cloudflare fight. It runs inside your already-authenticated browser session and uses the same endpoint the ChatGPT web app itself uses.

## Why this exists

ChatGPT's native export is a full-account email dump that can take hours. If you want a single conversation right now — for analysis, archival, or feeding into another tool — this is faster.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari, etc.)
2. Open Tampermonkey → *Create a new script*
3. Paste the contents of `chatgpt-extractor.user.js`
4. Save (Ctrl/Cmd + S)

## Use

1. Open any conversation on [chatgpt.com](https://chatgpt.com)
2. Click the green **⬇ Export** button (bottom-right)
3. Two files download: `<title>_<id>.json` and `<title>_<id>.md`

## What you get

**JSON** — structured for analysis:
```json
{
  "meta": {
    "id": "abc-123",
    "title": "My conversation",
    "create_time": "2026-04-10T14:22:01.000Z",
    "exported_at": "2026-04-16T09:00:00.000Z"
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

## Scope

- ✅ Linear visible thread (the conversation you see on screen)
- ✅ User + assistant messages
- ✅ Model slug per assistant message
- ✅ Timestamps
- ❌ Edited/regenerated branches (intentional — only the current thread)
- ❌ Images / file attachments (metadata only, not downloaded)

Want branches or attachments? Open an issue.

## Troubleshooting

**"No conversation detected"** — URL must contain `/c/<id>`. Open an actual conversation, not the home page.

**"API returned 401 / 403"** — Session expired. Refresh the page.

**"API returned 404"** — Conversation deleted or not yours.

**Button doesn't appear** — Check Tampermonkey is enabled and the script is active. Open DevTools console and look for errors prefixed with `[ChatGPT Extractor]`.

## Known limitations

- ChatGPT's internal API is undocumented and can change. If a future update breaks this, the fix is usually one line in `fetchConversation` or `extractLinearThread`.
- Works on `chatgpt.com`. The old `chat.openai.com` domain is also matched but now redirects.

## License

MIT. Use your own data. Don't abuse OpenAI's infrastructure — this hits the same endpoints as the web app, so normal rate limits apply.

## Contributing

PRs welcome for: branch extraction, attachment downloads, bulk export (list all conversations), format plugins.
