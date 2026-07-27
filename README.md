# France.tv Local Subtitle Translator

Chrome/Edge Manifest V3 extension for translating france.tv video subtitles to Simplified Chinese. Translation is sent only to a local service on `localhost` or `127.0.0.1`; the extension rejects non-local endpoints.

## Repository layout

- `manifest.json`: extension manifest.
- `content.js`: subtitle detection and in-video translation overlay.
- `background.js`: local translation bridge and endpoint validation.
- `popup.*`: popup UI and settings.
- `PRIVACY.md`: privacy policy text for local-only translation.
- `docs/chrome-web-store.md`: Chrome Web Store packaging and submission notes.
- `docs/implementation-flow.md`: full implementation flow and debugging notes.
- `scripts/start-ollama-for-extension.sh`: command-line Ollama startup helper.
- `scripts/package-extension.sh`: creates a Chrome Web Store upload ZIP in `dist/`.
- `launchd/com.local-subtitle.ollama.plist`: macOS LaunchAgent example for running Ollama with Chrome extension origins enabled.

## How it works

- Reads the active subtitle/caption cue from the page's `video.textTracks`.
- Falls back to visible subtitle-like DOM text near the lower half of the video.
- Sends each unique subtitle line to a local translation service.
- Shows the Chinese translation in an overlay at the bottom of the video.
- Stores only extension settings in `chrome.storage.sync`; subtitle text is cached in memory per tab.

## Local translation options

### Ollama

1. Install Ollama.
2. Pull a local model, for example:

   ```sh
   ollama pull qwen2.5:3b
   ```

3. Keep Ollama running. The default endpoint is:

   ```text
   http://127.0.0.1:11434
   ```

4. If you use another local model, change the model name from the extension popup.

### LibreTranslate

Run a local LibreTranslate server and set the extension provider to `LibreTranslate`. The default endpoint is:

```text
http://127.0.0.1:5000
```

## Load the extension

1. Open Chrome or Edge.
2. Go to `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Choose "Load unpacked".
5. Select this directory:

   ```text
   /Users/witt/workspace/france-tv-subtitle-translator
   ```

After changing files in this directory, open the extension page and click the reload button on this unpacked extension.

## Package for Chrome Web Store

Run:

```sh
scripts/package-extension.sh
```

The generated ZIP in `dist/` is the upload package. See `docs/chrome-web-store.md` for the store listing checklist and privacy disclosure notes.

## Troubleshooting

### The popup shows `Failed to fetch`

This means the browser extension cannot reach the local translation server. Check:

```sh
curl http://127.0.0.1:11434/api/tags
ollama list
```

If Ollama is not running, open the Ollama app or run:

```sh
ollama serve
```

If the model list is empty, pull the default model:

```sh
ollama pull qwen2.5:3b
```

### Ollama returns `HTTP 403`

Ollama is reachable, but it is rejecting requests from the browser extension origin. Allow Chrome extension origins before starting Ollama:

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*,http://localhost,http://127.0.0.1"
```

Then fully quit and reopen the Ollama app. If you run Ollama from the terminal instead of the app, start it like this:

```sh
OLLAMA_ORIGINS="chrome-extension://*,http://localhost,http://127.0.0.1" ollama serve
```

On macOS, you can also install the included LaunchAgent example after adjusting paths if needed:

```sh
cp launchd/com.local-subtitle.ollama.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.local-subtitle.ollama.plist
```

### Subtitles are visible but not translated

- Confirm the popup test translation works first.
- Enable subtitles inside the france.tv player.
- Reload the france.tv tab after reloading the unpacked extension.
- Open the popup on the video tab; it should say whether subtitles are detected from a standard text track or a page subtitle element.

## Privacy boundary

The background worker validates translation endpoints and only allows loopback hosts:

- `localhost`
- `127.0.0.1`
- other `127.x.x.x` loopback addresses
- `::1`

No analytics, tracking, cloud translation API, or remote logging is included.
