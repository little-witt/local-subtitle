(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    provider: "ollama",
    endpoint: "http://127.0.0.1:11434",
    model: "qwen2.5:3b",
    sourceLanguage: "fr",
    targetLanguage: "zh-CN",
    hideNativeCaptions: true
  };

  const STATE = {
    settings: { ...DEFAULT_SETTINGS },
    video: null,
    overlay: null,
    overlayText: null,
    lastOriginal: "",
    lastTranslation: "",
    lastError: "",
    lastSource: "",
    shouldHideNativeCaptions: false,
    cache: new Map(),
    pendingKey: "",
    sequence: 0,
    trackListeners: [],
    textTrackListListeners: [],
    lastTrackCount: -1,
    intervalId: 0,
    observer: null,
    style: null
  };

  init();

  async function init() {
    STATE.settings = await loadSettings();
    ensureOverlay();
    updateNativeCaptionStyle();
    scanForVideo();
    startObservers();
    startPolling();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      for (const [key, change] of Object.entries(changes)) {
        STATE.settings[key] = change.newValue;
      }

      STATE.lastOriginal = "";
      STATE.lastTranslation = "";
      STATE.lastError = "";
      updateNativeCaptionStyle();
      prepareVideoTracks();
      syncActiveCue();
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "ftv:getStatus") {
        return false;
      }

      sendResponse({
        ok: true,
        enabled: STATE.settings.enabled,
        hasVideo: Boolean(STATE.video),
        source: STATE.lastSource,
        original: STATE.lastOriginal,
        translation: STATE.lastTranslation,
        error: STATE.lastError,
        cacheSize: STATE.cache.size
      });
      return false;
    });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
        resolve({ ...DEFAULT_SETTINGS, ...items });
      });
    });
  }

  function startObservers() {
    STATE.observer = new MutationObserver(() => {
      scanForVideo();
    });

    STATE.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    document.addEventListener("fullscreenchange", () => {
      ensureOverlay();
      positionOverlay();
    });
  }

  function startPolling() {
    STATE.intervalId = window.setInterval(() => {
      scanForVideo();
      syncActiveCue();
      positionOverlay();
    }, 350);
  }

  function scanForVideo() {
    const video = choosePrimaryVideo();
    if (!video) {
      return;
    }

    if (video === STATE.video) {
      refreshTracksIfNeeded();
      return;
    }

    detachVideo();
    STATE.video = video;
    prepareVideoTracks();
    positionOverlay();
  }

  function choosePrimaryVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    let bestVideo = null;
    let bestScore = 0;

    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const area = visibleWidth * visibleHeight;

      if (area < 12000 || rect.width < 160 || rect.height < 90) {
        continue;
      }

      const score = area + (video.paused ? 0 : 100000);
      if (score > bestScore) {
        bestScore = score;
        bestVideo = video;
      }
    }

    return bestVideo || videos[0] || null;
  }

  function detachVideo() {
    for (const { track, listener } of STATE.trackListeners) {
      track.removeEventListener("cuechange", listener);
    }
    STATE.trackListeners = [];

    for (const { list, type, listener } of STATE.textTrackListListeners) {
      list.removeEventListener(type, listener);
    }
    STATE.textTrackListListeners = [];

    STATE.video = null;
    STATE.lastTrackCount = -1;
    STATE.lastOriginal = "";
    STATE.lastTranslation = "";
    STATE.lastSource = "";
    renderOverlay("");
  }

  function prepareVideoTracks() {
    if (!STATE.video) {
      return;
    }

    for (const { track, listener } of STATE.trackListeners) {
      track.removeEventListener("cuechange", listener);
    }
    STATE.trackListeners = [];

    const list = STATE.video.textTracks;
    if (!list) {
      return;
    }

    STATE.lastTrackCount = list.length;

    const addTrackListener = (track) => {
      if (!isSubtitleTrack(track)) {
        return;
      }

      if (shouldUseTrack(track) && track.mode === "disabled") {
        track.mode = "hidden";
      }

      const listener = () => syncActiveCue();
      track.addEventListener("cuechange", listener);
      STATE.trackListeners.push({ track, listener });
    };

    for (const track of Array.from(list)) {
      addTrackListener(track);
    }

    if (!STATE.textTrackListListeners.length) {
      const addListener = (event) => addTrackListener(event.track);
      list.addEventListener("addtrack", addListener);
      STATE.textTrackListListeners.push({ list, type: "addtrack", listener: addListener });
    }
  }

  function refreshTracksIfNeeded() {
    const trackCount = STATE.video?.textTracks?.length ?? -1;
    if (trackCount !== STATE.lastTrackCount) {
      prepareVideoTracks();
    }
  }

  function isSubtitleTrack(track) {
    return track && (track.kind === "subtitles" || track.kind === "captions");
  }

  function shouldUseTrack(track) {
    const source = String(STATE.settings.sourceLanguage || "fr").toLowerCase();
    const language = String(track.language || "").toLowerCase();
    const label = String(track.label || "").toLowerCase();

    if (source && language.startsWith(source)) {
      return true;
    }

    if (source === "fr" && /(francais|français|french|sous[-\s]?titres?|vf|fr\b)/i.test(label)) {
      return true;
    }

    const subtitleTracks = Array.from(STATE.video?.textTracks || []).filter(isSubtitleTrack);
    return subtitleTracks.length === 1;
  }

  function syncActiveCue() {
    if (!STATE.settings.enabled) {
      renderOverlay("");
      return;
    }

    const trackText = readActiveTextTrackText();
    if (trackText) {
      STATE.lastSource = "textTrack";
      translateAndRender(trackText);
      return;
    }

    const domText = readVisibleCaptionText();
    if (domText) {
      STATE.lastSource = "dom";
      translateAndRender(domText);
      return;
    }

    STATE.lastOriginal = "";
    STATE.lastTranslation = "";
    STATE.lastSource = "";
    STATE.pendingKey = "";
    renderOverlay("");
  }

  function readActiveTextTrackText() {
    if (!STATE.video?.textTracks) {
      return "";
    }

    const lines = [];
    for (const track of Array.from(STATE.video.textTracks)) {
      if (!isSubtitleTrack(track) || !shouldUseTrack(track)) {
        continue;
      }

      if (track.mode === "disabled") {
        track.mode = "hidden";
      }

      const cues = track.activeCues ? Array.from(track.activeCues) : [];
      for (const cue of cues) {
        const text = normalizeCueText(cue.text || "");
        if (text) {
          lines.push(text);
        }
      }
    }

    return uniqueLines(lines).join("\n").trim();
  }

  function readVisibleCaptionText() {
    if (!STATE.video) {
      return "";
    }

    const videoRect = STATE.video.getBoundingClientRect();
    if (videoRect.width < 160 || videoRect.height < 90) {
      return "";
    }

    const selectors = [
      "[class*='subtitle' i]",
      "[class*='caption' i]",
      "[class*='sous-titre' i]",
      "[class*='soustitre' i]",
      "[data-testid*='subtitle' i]",
      "[aria-live='polite']"
    ];

    const candidates = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (element === STATE.overlay || STATE.overlay?.contains(element)) {
          continue;
        }

        const text = normalizeCueText(element.textContent || "");
        if (!text || text.length > 400) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        if (!isLikelyCaptionRect(rect, videoRect) || !isVisibleElement(element)) {
          continue;
        }

        candidates.push(text);
      }
    }

    return uniqueLines(candidates).join("\n").trim();
  }

  function isLikelyCaptionRect(rect, videoRect) {
    if (rect.width < 20 || rect.height < 8) {
      return false;
    }

    const overlapsHorizontally = rect.right > videoRect.left && rect.left < videoRect.right;
    const insideLowerVideo = rect.top > videoRect.top + videoRect.height * 0.45 && rect.bottom < videoRect.bottom + 40;
    return overlapsHorizontally && insideLowerVideo;
  }

  function isVisibleElement(element) {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
  }

  function translateAndRender(original) {
    const normalized = normalizeCueText(original);
    if (!normalized) {
      renderOverlay("");
      return;
    }

    if (normalized === STATE.lastOriginal && STATE.lastTranslation) {
      renderOverlay(STATE.lastTranslation);
      return;
    }

    STATE.lastOriginal = normalized;
    STATE.lastTranslation = "";
    STATE.lastError = "";

    if (STATE.cache.has(normalized)) {
      const translation = STATE.cache.get(normalized);
      STATE.lastTranslation = translation;
      renderOverlay(translation);
      return;
    }

    if (STATE.pendingKey === normalized) {
      return;
    }

    STATE.pendingKey = normalized;
    const sequence = ++STATE.sequence;

    sendMessage({ type: "ftv:translate", text: normalized })
      .then((response) => {
        if (sequence !== STATE.sequence || STATE.lastOriginal !== normalized) {
          return;
        }

        STATE.pendingKey = "";

        if (!response?.ok) {
          throw new Error(response?.error || "翻译失败");
        }

        const translation = normalizeCueText(response.translation || "");
        STATE.lastTranslation = translation;
        remember(normalized, translation);
        renderOverlay(translation);
      })
      .catch((error) => {
        if (sequence !== STATE.sequence) {
          return;
        }

        STATE.pendingKey = "";
        STATE.lastError = error.message;
        renderOverlay("");
      });
  }

  function sendMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function remember(original, translation) {
    if (!translation) {
      return;
    }

    STATE.cache.set(original, translation);
    if (STATE.cache.size <= 300) {
      return;
    }

    const oldestKey = STATE.cache.keys().next().value;
    STATE.cache.delete(oldestKey);
  }

  function ensureOverlay() {
    const parent = getOverlayParent();

    if (!STATE.overlay) {
      const overlay = document.createElement("div");
      overlay.id = "ftv-local-subtitle-translator";
      overlay.setAttribute("aria-hidden", "true");

      const text = document.createElement("div");
      text.className = "ftv-local-subtitle-text";
      overlay.appendChild(text);

      STATE.overlay = overlay;
      STATE.overlayText = text;
    }

    if (STATE.overlay.parentElement !== parent) {
      parent.appendChild(STATE.overlay);
    }

    positionOverlay();
  }

  function getOverlayParent() {
    const fullscreenElement = document.fullscreenElement;
    if (fullscreenElement && fullscreenElement !== STATE.video) {
      return fullscreenElement;
    }

    return document.body || document.documentElement;
  }

  function positionOverlay() {
    if (!STATE.overlay || !STATE.video) {
      return;
    }

    const parent = STATE.overlay.parentElement;
    const videoRect = STATE.video.getBoundingClientRect();
    const parentRect = parent === document.body || parent === document.documentElement
      ? { left: 0, top: 0 }
      : parent.getBoundingClientRect();

    STATE.overlay.style.position = parent === document.body || parent === document.documentElement ? "fixed" : "absolute";
    STATE.overlay.style.left = `${Math.max(0, videoRect.left - parentRect.left)}px`;
    STATE.overlay.style.top = `${Math.max(0, videoRect.top - parentRect.top)}px`;
    STATE.overlay.style.width = `${Math.max(0, videoRect.width)}px`;
    STATE.overlay.style.height = `${Math.max(0, videoRect.height)}px`;
  }

  function renderOverlay(text) {
    ensureOverlay();

    if (!STATE.overlayText) {
      return;
    }

    const value = String(text || "").trim();
    STATE.overlayText.textContent = value;
    STATE.overlay.style.display = value && STATE.settings.enabled ? "block" : "none";
    STATE.shouldHideNativeCaptions = Boolean(value && STATE.settings.enabled && STATE.settings.hideNativeCaptions);
    updateNativeCaptionStyle();
  }

  function updateNativeCaptionStyle() {
    if (!STATE.style) {
      STATE.style = document.createElement("style");
      STATE.style.id = "ftv-local-subtitle-translator-style";
      document.documentElement.appendChild(STATE.style);
    }

    STATE.style.textContent = `
      ${STATE.shouldHideNativeCaptions ? `
      video::cue {
        visibility: hidden !important;
        opacity: 0 !important;
      }
      ` : ""}

      #ftv-local-subtitle-translator {
        box-sizing: border-box !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        display: none;
      }

      #ftv-local-subtitle-translator .ftv-local-subtitle-text {
        position: absolute !important;
        left: 50% !important;
        bottom: max(28px, 9%) !important;
        transform: translateX(-50%) !important;
        width: min(92%, 980px) !important;
        box-sizing: border-box !important;
        color: #fff !important;
        background: rgba(0, 0, 0, 0.64) !important;
        border-radius: 6px !important;
        padding: 8px 12px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif !important;
        font-size: clamp(18px, 2.6vh, 32px) !important;
        line-height: 1.35 !important;
        font-weight: 650 !important;
        text-align: center !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9) !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
      }
    `;
  }

  function normalizeCueText(text) {
    const noTags = String(text || "")
      .replace(/<v\s+[^>]+>/gi, "")
      .replace(/<\/v>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\{\\.*?\}/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();

    return decodeHtml(noTags);
  }

  function decodeHtml(text) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value.trim();
  }

  function uniqueLines(lines) {
    const seen = new Set();
    const result = [];

    for (const line of lines) {
      const normalized = normalizeCueText(line);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      result.push(normalized);
    }

    return result;
  }
})();
