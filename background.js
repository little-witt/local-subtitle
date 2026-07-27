const DEFAULT_SETTINGS = {
  enabled: true,
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model: "qwen2.5:3b",
  sourceLanguage: "fr",
  targetLanguage: "zh-CN",
  hideNativeCaptions: true
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ftv:translate") {
    return false;
  }

  translateSubtitle(message.text)
    .then((translation) => sendResponse({ ok: true, translation }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function translateSubtitle(text) {
  const cleanText = normalizeInput(text);
  if (!cleanText) {
    return "";
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    return "";
  }

  if (settings.provider === "libretranslate") {
    return translateWithLibreTranslate(cleanText, settings);
  }

  return translateWithOllama(cleanText, settings);
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      resolve({ ...DEFAULT_SETTINGS, ...items });
    });
  });
}

async function translateWithOllama(text, settings) {
  const endpoint = makeEndpoint(settings.endpoint, "/api/chat");
  assertLocalEndpoint(endpoint);

  const response = await fetchLocal(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model || DEFAULT_SETTINGS.model,
      stream: false,
      messages: [
        {
          role: "system",
          content: [
            "Translate video subtitles into natural Simplified Chinese.",
            "Return only the translated subtitle.",
            "Preserve line breaks when they help readability.",
            "Do not add explanations, labels, quotes, timestamps, or notes."
          ].join(" ")
        },
        {
          role: "user",
          content: text
        }
      ],
      options: {
        temperature: 0.1
      }
    })
  }, "Ollama");

  const data = await response.json();
  const content = data?.message?.content || data?.response || "";
  return normalizeOutput(content);
}

async function translateWithLibreTranslate(text, settings) {
  const endpoint = makeEndpoint(settings.endpoint, "/translate");
  assertLocalEndpoint(endpoint);

  const response = await fetchLocal(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: settings.sourceLanguage || DEFAULT_SETTINGS.sourceLanguage,
      target: normalizeLibreTranslateTarget(settings.targetLanguage),
      format: "text"
    })
  }, "LibreTranslate");

  const data = await response.json();
  return normalizeOutput(data?.translatedText || "");
}

async function fetchLocal(endpoint, options, label) {
  let response;

  try {
    response = await fetch(endpoint.href, options);
  } catch (error) {
    throw new Error(
      `无法连接本地 ${label} 服务：请确认 ${endpoint.origin} 正在运行。原始错误：${error.message}`
    );
  }

  if (!response.ok) {
    const details = await readErrorDetails(response);
    if (label === "Ollama" && response.status === 403) {
      throw new Error(
        "Ollama 拒绝了浏览器扩展来源：请设置 OLLAMA_ORIGINS=\"chrome-extension://*,http://localhost,http://127.0.0.1\" 后重启 Ollama。"
      );
    }
    throw new Error(`${label} 请求失败：HTTP ${response.status}${details ? `，${details}` : ""}`);
  }

  return response;
}

async function readErrorDetails(response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return "";
  }

  try {
    const data = JSON.parse(text);
    return normalizeOutput(data.error || data.message || text).slice(0, 160);
  } catch {
    return normalizeOutput(text).slice(0, 160);
  }
}

function makeEndpoint(rawEndpoint, defaultPath) {
  const fallback = DEFAULT_SETTINGS.endpoint;
  const endpoint = new URL(rawEndpoint || fallback);
  const currentPath = endpoint.pathname.replace(/\/+$/, "");

  if (!currentPath) {
    endpoint.pathname = defaultPath;
    return endpoint;
  }

  if (defaultPath === "/api/chat" && !currentPath.endsWith("/api/chat")) {
    endpoint.pathname = currentPath + "/api/chat";
  }

  if (defaultPath === "/translate" && !currentPath.endsWith("/translate")) {
    endpoint.pathname = currentPath + "/translate";
  }

  return endpoint;
}

function assertLocalEndpoint(endpoint) {
  const hostname = endpoint.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
  const isLoopback = hostname === "127.0.0.1" || hostname.startsWith("127.");

  if (!isLocalhost && !isLoopback) {
    throw new Error("为保护隐私，翻译端点只能使用 localhost 或 127.0.0.1。");
  }

  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("翻译端点必须是 http 或 https。");
  }
}

function normalizeLibreTranslateTarget(targetLanguage) {
  if (!targetLanguage || targetLanguage.toLowerCase() === "zh-cn") {
    return "zh";
  }
  return targetLanguage;
}

function normalizeInput(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeOutput(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/^\s*(translation|translated subtitle|chinese|中文|翻译|译文)\s*[:：]\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}
