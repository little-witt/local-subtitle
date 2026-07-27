# Implementation Flow

This project is a Chrome/Edge Manifest V3 extension that translates france.tv video subtitles into Simplified Chinese through a local-only translation service.

## 1. Browser Extension Structure

Files:

- `manifest.json`: MV3 permissions, france.tv content script matches, local-only host permissions, popup, and service worker.
- `content.js`: Detects the primary video, reads active subtitle cues, sends unique subtitle text to the background worker, and renders translated Chinese subtitles over the video.
- `background.js`: Talks to a local translation provider, validates loopback-only endpoints, normalizes model responses, and returns translated text to the content script.
- `popup.html`, `popup.css`, `popup.js`: Lets the user enable translation, select Ollama or LibreTranslate, edit endpoint/model/languages, and test local translation.

## 2. Subtitle Detection

The content script uses two paths:

1. Standard browser subtitle tracks via `video.textTracks` and `activeCues`.
2. A fallback scan for visible subtitle-like DOM text near the lower half of the video.

The standard text track path is preferred because it works cleanly with WebVTT/HLS captions and avoids scraping unrelated page text.

## 3. Translation Flow

For each active subtitle:

1. Normalize WebVTT cue text.
2. Skip empty or repeated text.
3. Check an in-memory cache.
4. Send the subtitle to the extension background worker.
5. The background worker calls the configured local service.
6. The content script displays the returned Chinese text in a non-interactive overlay.

The cache is per tab and in memory only. It is capped at 300 entries.

## 4. Privacy Boundary

The extension rejects non-local translation endpoints. Allowed hostnames are:

- `localhost`
- `127.0.0.1`
- other `127.x.x.x` loopback addresses
- `::1`

There is no analytics, tracking, remote logging, or cloud translation API in the extension.

## 5. Ollama Setup

Install and pull the default model:

```sh
ollama pull qwen2.5:3b
```

The default endpoint is:

```text
http://127.0.0.1:11434
```

Chrome extension requests include a `chrome-extension://...` origin. Ollama must allow that origin:

```sh
OLLAMA_ORIGINS="chrome-extension://*,http://localhost,http://127.0.0.1" ollama serve
```

On macOS, the included LaunchAgent example can run Ollama with the required environment variable:

```text
launchd/com.local-subtitle.ollama.plist
```

## 6. Debugging Done During Implementation

Observed error:

```text
Failed to fetch
```

Cause:

- Ollama was not listening on `127.0.0.1:11434`, or no model was installed.

Fix:

- Start Ollama.
- Pull `qwen2.5:3b`.
- Confirm:

  ```sh
  curl http://127.0.0.1:11434/api/tags
  ```

Observed error:

```text
Ollama request failed: HTTP 403
```

Cause:

- Ollama rejected browser extension origins.

Fix:

- Start Ollama with:

  ```sh
  OLLAMA_ORIGINS="chrome-extension://*,http://localhost,http://127.0.0.1" ollama serve
  ```

Verified request:

```sh
curl -i http://127.0.0.1:11434/api/chat \
  -H 'Origin: chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef' \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5:3b","stream":false,"messages":[{"role":"system","content":"Translate into Simplified Chinese. Return only the translation."},{"role":"user","content":"Bonjour"}]}'
```

Expected result:

```text
HTTP/1.1 200 OK
Access-Control-Allow-Origin: chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef
```

## 7. Verification

Static checks:

```sh
node --check background.js
node --check content.js
node --check popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

Local API check:

```sh
curl http://127.0.0.1:11434/api/tags
```

Popup check:

1. Reload the unpacked extension in `chrome://extensions`.
2. Refresh the france.tv video tab.
3. Open the extension popup.
4. Click "测试本地翻译".

