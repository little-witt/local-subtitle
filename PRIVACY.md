# Privacy Policy

France.tv Local Subtitle Translator is designed for local-only subtitle translation.

## Data Processed

When enabled, the extension reads subtitle text from the active `france.tv` video page and sends that text only to the local translation endpoint configured by the user, such as `http://127.0.0.1:11434` for Ollama.

The extension stores only user settings through `chrome.storage.sync`, including whether translation is enabled, provider selection, endpoint, model name, source language, target language, and whether native captions should be hidden.

## Data Not Collected

The extension does not collect, sell, share, upload, or remotely store:

- browsing history
- video watch history
- subtitle text
- translated subtitle text
- account information
- analytics or tracking identifiers

Subtitle text is cached only in memory inside the active browser tab to avoid repeated local translation calls. That cache is cleared when the tab or extension context is closed.

## Network Access

The extension validates translation endpoints and only allows loopback hosts:

- `localhost`
- `127.0.0.1`
- other `127.x.x.x` loopback addresses
- `::1`

No cloud translation API, remote logging endpoint, analytics service, or external backend is included.

## Permissions

The extension requests access to `france.tv` pages so it can read video subtitle cues and display a translated overlay. It requests access to `localhost` and `127.0.0.1` only so it can communicate with the user's local translation service.
