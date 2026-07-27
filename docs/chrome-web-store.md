# Chrome Web Store Publishing Notes

This extension can be uploaded to the Chrome Web Store after packaging, but the final submission must be completed from the publisher's Chrome Web Store developer account.

## Before Upload

1. Confirm the extension works locally from `chrome://extensions` with Developer mode enabled.
2. Start the local translation service, for example Ollama at `http://127.0.0.1:11434`.
3. Confirm the popup test translation succeeds.
4. Run local checks:

   ```sh
   node --check background.js
   node --check content.js
   node --check popup.js
   python3 -m json.tool manifest.json >/dev/null
   ```

5. Build the upload package:

   ```sh
   scripts/package-extension.sh
   ```

The ZIP printed by the script is the file to upload. Its root contains `manifest.json` and only the runtime extension files.

## Store Listing

Prepare these materials in the Chrome Web Store Developer Dashboard:

- extension name: `France.tv Local Subtitle Translator`
- short description: local-only Simplified Chinese subtitle translation for france.tv videos
- detailed description explaining that subtitles are translated through the user's own local Ollama or LibreTranslate service
- category: `Accessibility` or `Productivity`
- language: Chinese or English, depending on the intended listing audience
- extension icon: `icons/icon128.png`
- screenshots showing the popup and translated subtitle overlay
- privacy policy text or URL based on `PRIVACY.md`

## Privacy Disclosure Guidance

Use conservative disclosures:

- State that subtitle text is processed locally by the user's configured local translation service.
- State that the extension does not collect or transmit user data to the developer.
- State that settings are stored in Chrome sync storage.
- Do not claim that no data is processed at all, because subtitle text is read from the page and sent to the user's local service.

## Review Notes

The extension uses host permissions for:

- `france.tv` pages, to read active subtitle cues and render the translated overlay
- `localhost` and `127.0.0.1`, to call the local translation service

If the review team asks why local network access is needed, explain that the extension intentionally rejects non-loopback translation endpoints to keep subtitle translation private and local.
