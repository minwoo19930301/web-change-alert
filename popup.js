const manifest = chrome.runtime.getManifest();
const APP_NAME = chrome.i18n.getMessage("extensionName") || manifest?.name || "Web Change Alert";
const APP_VERSION = manifest?.version || "1.0.0";
const AUTHOR_NAME = "Minwoo Kim";

const localizer = globalThis.WebChangeLocalizer || null;

const listEl = document.getElementById("list");
const addBtn = document.getElementById("addBtn");
const addWrap = document.getElementById("addWrap");
const urlInput = document.getElementById("urlInput");
const startPickerBtn = document.getElementById("startPicker");

const confirmOverlay = document.getElementById("confirmOverlay");
const confirmTarget = document.getElementById("confirmTarget");
const confirmCancel = document.getElementById("confirmCancel");
const confirmDelete = document.getElementById("confirmDelete");

const langBtn = document.getElementById("langBtn");
const langMenu = document.getElementById("langMenu");
const langOptionsWrap = document.getElementById("langOptions");

const aboutBtn = document.getElementById("aboutBtn");
const aboutOverlay = document.getElementById("aboutOverlay");
const aboutClose = document.getElementById("aboutClose");
const noticeText = document.getElementById("noticeText");
const aboutAppName = document.getElementById("aboutAppName");
const aboutVersion = document.getElementById("aboutVersion");
const aboutAuthor = document.getElementById("aboutAuthor");

const fallbackLanguageOptions = [
  { code: "auto", label: "System (Chrome)" },
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "it", label: "Italiano" },
  { code: "ar", label: "العربية" }
];

let pendingDeleteId = null;
let activeTab = null;
let currentMonitors = [];
let currentLanguagePreference = "auto";
let translator = {
  t(key, vars = {}) {
    let template = chrome.i18n.getMessage(key) || key;
    for (const [name, value] of Object.entries(vars)) {
      template = template.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
    return template;
  },
  effective: normalizeUiLocaleTag(chrome.i18n.getUILanguage?.() || "en"),
  isRtl: false
};

bindEvents();
init();

function bindEvents() {
  addBtn.addEventListener("click", () => {
    setAddSectionVisible(true);
  });

  confirmCancel.addEventListener("click", () => {
    closeConfirm();
  });

  confirmOverlay.addEventListener("click", (event) => {
    if (event.target === confirmOverlay) {
      closeConfirm();
    }
  });

  confirmDelete.addEventListener("click", async () => {
    if (!pendingDeleteId) return;
    const response = await chrome.runtime.sendMessage({ type: "deleteMonitors", ids: [pendingDeleteId] });
    if (response?.ok) {
      closeConfirm();
      init();
    }
  });

  startPickerBtn.addEventListener("click", async () => {
    let url = urlInput.value.trim();
    if (!url && activeTab?.url && isUsableUrl(activeTab.url)) {
      url = activeTab.url;
      urlInput.value = url;
    }
    if (!url || !isUsableUrl(url)) {
      urlInput.focus();
      if (urlInput.reportValidity) urlInput.reportValidity();
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "startPicker",
      url,
      requestId: buildRequestId(),
      tabId: activeTab?.id
    });

    if (!response?.ok) {
      urlInput.setCustomValidity(t("pickerStartFailed"));
      if (urlInput.reportValidity) urlInput.reportValidity();
      urlInput.setCustomValidity("");
      return;
    }

    window.close();
  });

  if (langBtn) {
    langBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      langMenu.classList.toggle("hidden");
    });
  }

  if (langOptionsWrap) {
    langOptionsWrap.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-lang]");
      if (!button) return;
      const language = button.dataset.lang;
      await setLanguage(language);
      langMenu.classList.add("hidden");
    });
  }

  aboutBtn.addEventListener("click", () => {
    aboutOverlay.classList.remove("hidden");
  });

  aboutOverlay.addEventListener("click", (event) => {
    if (event.target === aboutOverlay) {
      aboutOverlay.classList.add("hidden");
    }
  });

  aboutClose.addEventListener("click", () => {
    aboutOverlay.classList.add("hidden");
  });

  document.addEventListener("click", (event) => {
    if (langMenu?.classList.contains("hidden")) return;
    if (event.target === langBtn || langBtn?.contains(event.target) || langMenu?.contains(event.target)) return;
    langMenu?.classList.add("hidden");
  });
}

async function init() {
  setAddSectionVisible(false);

  const [tab, monitorData, preferredLanguage] = await Promise.all([
    getActiveTab(),
    chrome.storage.local.get(["monitors"]),
    getPreferredLanguage()
  ]);

  activeTab = tab;
  currentMonitors = Array.isArray(monitorData.monitors) ? monitorData.monitors : [];
  currentLanguagePreference = preferredLanguage || "auto";

  translator = await createTranslator(currentLanguagePreference);
  applyDocumentDirection();
  renderLanguageOptions();
  applyStaticTexts();
  render(currentMonitors);

  if (tab?.url && isUsableUrl(tab.url)) {
    urlInput.value = tab.url;
  }

  await chrome.storage.local.remove(["draftSelection"]);
}

async function setLanguage(language) {
  const nextLanguage = language || "auto";
  currentLanguagePreference = await savePreferredLanguage(nextLanguage);
  translator = await createTranslator(currentLanguagePreference);
  applyDocumentDirection();
  renderLanguageOptions();
  applyStaticTexts();
  render(currentMonitors);
}

function renderLanguageOptions() {
  if (!langOptionsWrap) return;
  const options = typeof localizer?.getLanguageOptions === "function"
    ? localizer.getLanguageOptions()
    : fallbackLanguageOptions;

  langOptionsWrap.innerHTML = "";

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lang-option";
    button.dataset.lang = option.code;
    if (option.code === "auto") {
      button.textContent = t("languageSystem");
    } else {
      button.textContent = option.label;
    }
    button.classList.toggle("active", option.code === currentLanguagePreference);
    langOptionsWrap.appendChild(button);
  }
}

function applyDocumentDirection() {
  const isRtl = Boolean(translator?.isRtl);
  document.documentElement.lang = normalizeUiLocaleTag(translator?.effective || chrome.i18n.getUILanguage?.() || "en");
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
}

function applyStaticTexts() {
  document.title = t("documentTitle");
  if (langBtn) langBtn.title = t("languageButton");
  aboutBtn.title = t("aboutButton");

  const i18nNodes = document.querySelectorAll("[data-i18n]");
  for (const node of i18nNodes) {
    const key = node.getAttribute("data-i18n");
    if (!key) continue;
    node.textContent = t(key);
  }

  noticeText.textContent = t("notice");
  aboutAppName.textContent = APP_NAME;
  aboutVersion.textContent = APP_VERSION;
  aboutAuthor.textContent = AUTHOR_NAME;
}

function render(monitors) {
  listEl.innerHTML = "";
  if (!monitors.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("emptyMonitors");
    listEl.appendChild(empty);
    return;
  }

  for (const monitor of monitors) {
    const card = document.createElement("div");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "header-row";

    const alarmToggleEl = buildToggle(Boolean(monitor.schedule?.enabled), async (checked) => {
      await chrome.runtime.sendMessage({ type: "updateMonitor", id: monitor.id, updates: { scheduleEnabled: checked } });
      init();
    });

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = formatSchedule(monitor.schedule);
    applyScheduleColor(tag, monitor.schedule);

    const left = document.createElement("div");
    left.className = "header-left";
    left.appendChild(alarmToggleEl);
    left.appendChild(tag);

    if (monitor.lastError) {
      const errorLink = document.createElement("span");
      errorLink.className = "error-inline";
      errorLink.textContent = t("collectFailedPrefix");
      errorLink.title = monitor.lastError;

      const retryLink = document.createElement("span");
      retryLink.className = "error-link";
      retryLink.textContent = t("reselect");
      retryLink.title = monitor.lastError;
      retryLink.addEventListener("click", async (event) => {
        event.stopPropagation();
        const response = await chrome.runtime.sendMessage({
          type: "startPicker",
          url: monitor.url,
          requestId: buildRequestId(),
          tabId: activeTab?.id,
          mode: "update",
          monitorId: monitor.id
        });
        if (response?.ok) {
          window.close();
        }
      });
      left.appendChild(errorLink);
      left.appendChild(retryLink);
    }

    const actions = document.createElement("div");
    actions.className = "header-actions";

    const runBtn = document.createElement("button");
    runBtn.className = "run-btn";
    runBtn.type = "button";
    runBtn.textContent = "▶";
    runBtn.title = t("runNow");
    runBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const response = await chrome.runtime.sendMessage({ type: "runMonitorNow", id: monitor.id });
      if (response?.ok) init();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "×";
    deleteBtn.title = t("delete");
    deleteBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      openConfirm(monitor);
    });

    header.appendChild(left);
    actions.appendChild(runBtn);
    actions.appendChild(deleteBtn);
    header.appendChild(actions);

    const line = document.createElement("div");
    line.className = "line";

    const link = document.createElement("a");
    link.className = "title-link";
    link.href = monitor.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = monitor.title || shortenUrl(monitor.url);
    link.title = monitor.title ? `${monitor.title}\n${monitor.url}` : monitor.url;

    const valueRow = buildValueRow(monitor);

    card.appendChild(header);
    line.appendChild(link);
    line.appendChild(valueRow);
    card.appendChild(line);

    listEl.appendChild(card);
  }
}

function buildToggle(checked, onChange) {
  const label = document.createElement("label");
  label.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  if (onChange) {
    input.addEventListener("change", () => onChange(input.checked));
  }
  const slider = document.createElement("span");
  slider.className = "slider";
  label.appendChild(input);
  label.appendChild(slider);
  return label;
}

function buildValueRow(monitor) {
  const row = document.createElement("div");
  row.className = "value-row";

  const prevChangedValue = monitor.previousValue ?? "";
  const prevChangedAt = monitor.previousChangedAt ?? null;
  const currentNormalized = normalizeValue(monitor.lastValue || "");
  const prevNormalized = normalizeValue(prevChangedValue);
  const hasPrev = Boolean(prevChangedAt && prevNormalized && prevNormalized !== currentNormalized);

  const prevCol = document.createElement("div");
  prevCol.className = "value-col value-col-prev";
  const prevLabel = document.createElement("div");
  prevLabel.className = "value-col-label";
  prevLabel.textContent = t("notificationPrevious");
  prevCol.appendChild(prevLabel);

  const prevMain = document.createElement("div");
  prevMain.className = "value-main";
  if (hasPrev) {
    const prevIsImage = appendValuePreview(prevMain, monitor, prevChangedValue, true);
    if (prevIsImage) prevMain.classList.add("is-image");
  } else {
    const placeholder = document.createElement("s");
    placeholder.className = "prev-text";
    placeholder.textContent = "—";
    prevMain.appendChild(placeholder);
  }
  prevCol.appendChild(prevMain);

  if (hasPrev && prevChangedAt) {
    const prevTime = document.createElement("s");
    prevTime.className = "time";
    prevTime.textContent = `(${formatDate(prevChangedAt)})`;
    prevCol.appendChild(prevTime);
  }

  const currentCol = document.createElement("div");
  currentCol.className = "value-col value-col-current";
  const currentLabel = document.createElement("div");
  currentLabel.className = "value-col-label";
  currentLabel.textContent = t("notificationCurrent");
  currentCol.appendChild(currentLabel);

  const currentMain = document.createElement("div");
  currentMain.className = "value-main";
  const currentIsImage = appendValuePreview(currentMain, monitor, monitor.lastValue, false);
  if (currentIsImage) currentMain.classList.add("is-image");
  currentCol.appendChild(currentMain);

  if (monitor.lastChangedAt) {
    const currentTime = document.createElement("span");
    currentTime.className = "time";
    currentTime.textContent = `(${formatDate(monitor.lastChangedAt)})`;
    currentCol.appendChild(currentTime);
  }

  row.appendChild(prevCol);
  row.appendChild(currentCol);
  return row;
}

function appendValuePreview(container, monitor, rawValue, isPrevious) {
  const value = String(rawValue || "").trim();
  if (isImageValue(monitor, value)) {
    const resolvedImageSrc = resolveImageUrl(value, monitor?.url);
    const imageWrap = document.createElement("span");
    imageWrap.className = isPrevious ? "value-image-wrap value-image-wrap-prev" : "value-image-wrap";

    const image = document.createElement("img");
    image.className = isPrevious ? "value-image value-image-prev" : "value-image";
    image.src = resolvedImageSrc || value;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.style.display = "none";
      imageWrap.classList.add("value-image-broken");
      imageWrap.textContent = t("imageLabel");
    });
    imageWrap.appendChild(image);

    if (isPrevious) {
      const strike = document.createElement("span");
      strike.className = "value-image-strike";
      imageWrap.appendChild(strike);
    }
    container.appendChild(imageWrap);
    return true;
  }

  const text = document.createElement(isPrevious ? "s" : "span");
  text.className = isPrevious ? "prev-text" : "value";
  text.textContent = value || (isPrevious ? t("prevValueEmpty") : t("valueEmpty"));
  applyDisplayStyle(text, monitor?.displayStyle);
  container.appendChild(text);
  return false;
}

function applyDisplayStyle(node, style) {
  if (!node || !style || typeof style !== "object") return;
  if (style.__noInnerText !== true) return;
  const allowedKeys = [
    "color",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "fontFamily",
    "letterSpacing",
    "textDecoration",
    "textTransform",
    "lineHeight",
    "backgroundColor"
  ];
  for (const key of allowedKeys) {
    const value = style[key];
    if (typeof value === "string" && value.trim()) {
      node.style[key] = value;
    }
  }
  node.style.whiteSpace = "pre-wrap";
}

function isImageValue(monitor, value) {
  if (!value) return false;
  if (monitor?.extract?.type === "image") return true;
  return Boolean(resolveImageUrl(value, monitor?.url));
}

function resolveImageUrl(value, baseUrl) {
  if (!value) return "";
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^data:image\//i.test(raw)) return raw;
  if (/^blob:/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(raw) ? raw : "";
  }
  if (!/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(raw)) return "";
  try {
    const base = baseUrl && /^https?:/i.test(baseUrl) ? baseUrl : "http://localhost/";
    const url = new URL(raw, base);
    if (!/^https?:/i.test(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function setAddSectionVisible(visible) {
  addWrap.hidden = !visible;
  addBtn.hidden = visible;
  if (visible && activeTab?.url && isUsableUrl(activeTab.url)) {
    urlInput.value = activeTab.url;
  }
}

function openConfirm(monitor) {
  pendingDeleteId = monitor?.id || null;
  confirmTarget.textContent = monitor?.title || shortenUrl(monitor?.url || "");
  confirmOverlay.classList.remove("hidden");
}

function closeConfirm() {
  pendingDeleteId = null;
  confirmOverlay.classList.add("hidden");
}

function formatSchedule(schedule) {
  if (!schedule?.enabled) return t("alarmOff");
  if (schedule.type === "interval") {
    const minutes = Math.max(1, schedule.minutes || 1);
    return t("everyMinutes", { minutes });
  }
  if (schedule.type === "daily") {
    return t("dailyTime", { time: `${pad(schedule.hour)}:${pad(schedule.minute)}` });
  }
  if (schedule.type === "weekly") {
    const day = t(`weekday${schedule.weekday ?? 0}`);
    return t("weeklyTime", { day, time: `${pad(schedule.hour)}:${pad(schedule.minute)}` });
  }
  if (schedule.type === "monthly") {
    return t("monthlyTime", { day: schedule.day, time: `${pad(schedule.hour)}:${pad(schedule.minute)}` });
  }
  return t("alarm");
}

function applyScheduleColor(tag, schedule) {
  if (!schedule?.enabled) {
    tag.style.backgroundColor = "#f1f3f4";
    tag.style.color = "#9aa0a6";
    return;
  }
  if (schedule.type !== "interval") {
    tag.style.backgroundColor = "var(--accent-soft)";
    tag.style.color = "var(--accent-text)";
    return;
  }
  const minutes = Math.max(1, schedule.minutes || 1);
  const maxMinutes = 1440;
  const ratio = 1 - Math.min(minutes, maxMinutes) / maxMinutes;
  const hue = Math.round(120 * (1 - ratio));
  const bg = `hsl(${hue}, 80%, 88%)`;
  const text = `hsl(${hue}, 60%, 30%)`;
  tag.style.backgroundColor = bg;
  tag.style.color = text;
}

function pad(value) {
  return String(value ?? "0").padStart(2, "0");
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(translator?.effective || normalizeUiLocaleTag(chrome.i18n.getUILanguage?.() || "en"));
}

function normalizeValue(value) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 20 ? parsed.pathname.slice(0, 20) + "…" : parsed.pathname;
    return `${parsed.hostname}${path}`;
  } catch {
    return url;
  }
}

function buildRequestId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] || null;
}

function isUsableUrl(url) {
  return /^https?:/i.test(url || "");
}

async function getPreferredLanguage() {
  if (!localizer?.getSettingsLanguage) return "auto";
  return localizer.getSettingsLanguage();
}

async function savePreferredLanguage(language) {
  if (!localizer?.setSettingsLanguage) return language || "auto";
  return localizer.setSettingsLanguage(language || "auto");
}

async function createTranslator(language) {
  if (localizer?.createTranslator) {
    return localizer.createTranslator(language || "auto");
  }
  return {
    preferred: language || "auto",
    effective: normalizeUiLocaleTag(chrome.i18n.getUILanguage?.() || "en"),
    isRtl: false,
    t(key, vars = {}) {
      let template = chrome.i18n.getMessage(key) || key;
      for (const [name, value] of Object.entries(vars)) {
        template = template.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
      }
      return template;
    }
  };
}

function normalizeUiLocaleTag(value) {
  const input = String(value || "en").replace("_", "-");
  const lower = input.toLowerCase();
  if (lower.startsWith("pt-br")) return "pt-BR";
  if (lower.startsWith("zh-cn") || lower.startsWith("zh-sg")) return "zh-CN";
  if (lower.startsWith("zh-tw") || lower.startsWith("zh-hk") || lower.startsWith("zh-mo")) return "zh-TW";
  if (lower.startsWith("ar")) return "ar";
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("ru")) return "ru";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("it")) return "it";
  return "en";
}

function t(key, vars = {}) {
  return translator.t(key, vars);
}
