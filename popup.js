const DEFAULT_SETTINGS = {
  enabled: true,
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model: "qwen2.5:3b",
  sourceLanguage: "fr",
  targetLanguage: "zh-CN",
  hideNativeCaptions: true
};

const fields = {
  enabled: document.querySelector("#enabled"),
  provider: document.querySelector("#provider"),
  endpoint: document.querySelector("#endpoint"),
  model: document.querySelector("#model"),
  sourceLanguage: document.querySelector("#sourceLanguage"),
  targetLanguage: document.querySelector("#targetLanguage"),
  hideNativeCaptions: document.querySelector("#hideNativeCaptions")
};

const statusLine = document.querySelector("#statusLine");
const errorLine = document.querySelector("#errorLine");
const modelRow = document.querySelector("#modelRow");
const testButton = document.querySelector("#testButton");
const testOutput = document.querySelector("#testOutput");

init();

async function init() {
  const settings = await loadSettings();
  renderSettings(settings);
  updateProviderUi();
  await refreshStatus();

  for (const [key, field] of Object.entries(fields)) {
    field.addEventListener("change", () => saveFromForm(key));
    field.addEventListener("input", debounce(() => saveFromForm(key), 250));
  }

  testButton.addEventListener("click", testTranslation);
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      resolve({ ...DEFAULT_SETTINGS, ...items });
    });
  });
}

function renderSettings(settings) {
  fields.enabled.checked = Boolean(settings.enabled);
  fields.provider.value = settings.provider || DEFAULT_SETTINGS.provider;
  fields.endpoint.value = settings.endpoint || DEFAULT_SETTINGS.endpoint;
  fields.model.value = settings.model || DEFAULT_SETTINGS.model;
  fields.sourceLanguage.value = settings.sourceLanguage || DEFAULT_SETTINGS.sourceLanguage;
  fields.targetLanguage.value = settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage;
  fields.hideNativeCaptions.checked = Boolean(settings.hideNativeCaptions);
}

async function saveFromForm(changedKey) {
  if (changedKey === "provider") {
    setDefaultEndpointForProvider();
    updateProviderUi();
  }

  const settings = {
    enabled: fields.enabled.checked,
    provider: fields.provider.value,
    endpoint: fields.endpoint.value.trim(),
    model: fields.model.value.trim(),
    sourceLanguage: fields.sourceLanguage.value.trim(),
    targetLanguage: fields.targetLanguage.value.trim(),
    hideNativeCaptions: fields.hideNativeCaptions.checked
  };

  await chrome.storage.sync.set(settings);
  await refreshStatus();
}

function setDefaultEndpointForProvider() {
  if (fields.provider.value === "libretranslate" && !fields.endpoint.value.includes(":5000")) {
    fields.endpoint.value = "http://127.0.0.1:5000";
  }

  if (fields.provider.value === "ollama" && fields.endpoint.value.includes(":5000")) {
    fields.endpoint.value = DEFAULT_SETTINGS.endpoint;
  }
}

function updateProviderUi() {
  modelRow.style.display = fields.provider.value === "ollama" ? "grid" : "none";
}

async function refreshStatus() {
  const response = await sendToActiveTab({ type: "ftv:getStatus" }).catch(() => null);

  if (!response?.ok) {
    statusLine.textContent = "打开 france.tv 视频页后可查看字幕检测状态。";
    errorLine.style.display = "none";
    return;
  }

  const source = response.source === "textTrack" ? "标准字幕轨道" : response.source === "dom" ? "页面字幕元素" : "未检测到字幕";
  statusLine.textContent = response.hasVideo
    ? `已检测到视频；字幕来源：${source}；缓存 ${response.cacheSize || 0} 条。`
    : "当前标签页未检测到视频。";

  if (response.error) {
    errorLine.textContent = response.error;
    errorLine.style.display = "block";
  } else {
    errorLine.style.display = "none";
  }
}

async function testTranslation() {
  testButton.disabled = true;
  testOutput.textContent = "请求本地翻译服务...";

  chrome.runtime.sendMessage({ type: "ftv:translate", text: "Bonjour, comment ca va ?" }, (response) => {
    testButton.disabled = false;

    const error = chrome.runtime.lastError;
    if (error) {
      testOutput.textContent = error.message;
      return;
    }

    if (!response?.ok) {
      testOutput.textContent = response?.error || "翻译失败";
      return;
    }

    testOutput.textContent = response.translation || "(空结果)";
  });
}

async function sendToActiveTab(payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return null;
  }

  return chrome.tabs.sendMessage(tab.id, payload);
}

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
