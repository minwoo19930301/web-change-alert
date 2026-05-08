const localizer = globalThis.WebChangeLocalizer || null;

const emptyState = document.getElementById("emptyState");
const emptyMessage = document.getElementById("emptyMessage");
const payloadState = document.getElementById("payloadState");
const urlValue = document.getElementById("urlValue");
const selectorValue = document.getElementById("selectorValue");
const extractValue = document.getElementById("extractValue");
const scheduleValue = document.getElementById("scheduleValue");
const filterValue = document.getElementById("filterValue");
const previewValue = document.getElementById("previewValue");
const missingBadge = document.getElementById("missingBadge");
const registerBtn = document.getElementById("registerBtn");
const openSiteBtn = document.getElementById("openSiteBtn");
const statusEl = document.getElementById("status");

let translator = null;
let currentSpec = null;

init();

async function init() {
  translator = await createTranslator();
  applyDocumentLanguage();
  applyStaticTexts();

  registerBtn?.addEventListener("click", registerMonitor);
  openSiteBtn?.addEventListener("click", openTargetSite);

  const payloadResult = parsePayload();
  if (!payloadResult.ok) {
    showEmpty(payloadResult.errorKey || "agentPayloadMissing");
    return;
  }

  currentSpec = payloadResult.payload;
  showPayload();
  renderSpec(currentSpec);
  await previewMonitor();
}

async function createTranslator() {
  if (!localizer?.createTranslator || !localizer?.getSettingsLanguage) {
    return { effective: "en", isRtl: false, t: fallbackTranslate };
  }
  try {
    const preferred = await localizer.getSettingsLanguage();
    return await localizer.createTranslator(preferred || "auto");
  } catch {
    return { effective: "en", isRtl: false, t: fallbackTranslate };
  }
}

function fallbackTranslate(key, vars = {}) {
  let template = "";
  try {
    template = chrome.i18n?.getMessage?.(key) || key;
  } catch {
    template = key;
  }
  for (const [name, value] of Object.entries(vars)) {
    template = template.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
  }
  return template;
}

function t(key, vars = {}) {
  return (translator?.t || fallbackTranslate)(key, vars);
}

function applyDocumentLanguage() {
  document.documentElement.lang = translator?.effective || "en";
  document.documentElement.dir = translator?.isRtl ? "rtl" : "ltr";
}

function applyStaticTexts() {
  document.title = t("agentPageTitle");
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.getAttribute("data-i18n");
    if (key) node.textContent = t(key);
  }
}

function parsePayload() {
  const params = new URLSearchParams(window.location.search);
  const hashText = String(window.location.hash || "").replace(/^#/, "");
  const hashParams = new URLSearchParams(hashText);
  const encoded = params.get("payload") || hashParams.get("payload") || "";
  if (!encoded) return { ok: false, errorKey: "agentPayloadMissing" };

  try {
    const json = decodeBase64Url(encoded);
    const parsed = JSON.parse(json);
    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, errorKey: "agentPayloadInvalid" };
  }
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function showEmpty(key) {
  emptyState?.classList.remove("hidden");
  payloadState?.classList.add("hidden");
  if (emptyMessage) emptyMessage.textContent = t(key);
}

function showPayload() {
  emptyState?.classList.add("hidden");
  payloadState?.classList.remove("hidden");
}

async function previewMonitor() {
  setStatus(t("agentPreviewing"));
  registerBtn.disabled = true;
  try {
    const response = await sendMessage({ type: "agentPreviewMonitor", spec: currentSpec });
    if (!response?.ok) throw new Error(response?.error || "preview_failed");
    currentSpec = response.spec || currentSpec;
    renderSpec(currentSpec);
    renderPreview(response.value || "", Boolean(response.missing));
    registerBtn.disabled = false;
    setStatus("");
  } catch (error) {
    renderPreview("", false);
    setStatus(`${t("agentPreviewFailed")}: ${error?.message || String(error)}`, "error");
  }
}

async function registerMonitor() {
  if (!currentSpec) return;
  registerBtn.disabled = true;
  registerBtn.textContent = t("agentRegistering");
  setStatus("");
  try {
    const response = await sendMessage({ type: "agentRegisterMonitor", spec: currentSpec });
    if (!response?.ok) throw new Error(response?.error || "register_failed");
    renderPreview(response.value || "", Boolean(response.missing));
    setStatus(t("agentRegisterDone"), "success");
  } catch (error) {
    registerBtn.disabled = false;
    setStatus(`${t("agentRegisterFailed")}: ${error?.message || String(error)}`, "error");
  } finally {
    registerBtn.textContent = t("agentRegister");
  }
}

function openTargetSite() {
  if (!currentSpec?.url) return;
  chrome.tabs.create({ url: currentSpec.url });
}

function renderSpec(spec) {
  if (urlValue) urlValue.textContent = spec?.url || "";
  if (selectorValue) selectorValue.textContent = spec?.selector || "";
  if (extractValue) extractValue.textContent = formatExtract(spec?.extract);
  if (scheduleValue) scheduleValue.textContent = formatSchedule(spec?.schedule);
  if (filterValue) filterValue.textContent = formatFilter(spec?.filter);
}

function renderPreview(value, missing) {
  if (previewValue) previewValue.textContent = value || t("valueEmpty");
  missingBadge?.classList.toggle("hidden", !missing);
}

function formatExtract(extract) {
  const raw = typeof extract === "string" ? { type: extract } : extract || {};
  const type = raw.type || "text";
  if (type === "attr" && raw.attr) return `${t("typeAttr")}: ${raw.attr}`;
  if (type === "textToken") return `${t("typeText")} #${Number(raw.index || 0) + 1}`;
  if (type === "image") return t("typeImage");
  if (type === "value") return t("typeValue");
  return t("typeText");
}

function formatSchedule(schedule) {
  const raw = schedule || { type: "interval", minutes: 10 };
  if (raw.enabled === false) return t("alarmOff");
  if (raw.type === "daily") return t("dailyTime", { time: formatTime(raw.hour, raw.minute) });
  if (raw.type === "weekly") {
    return t("weeklyTime", { day: t(`weekday${raw.weekday ?? 0}`), time: formatTime(raw.hour, raw.minute) });
  }
  if (raw.type === "monthly") return t("monthlyTime", { day: raw.day || 1, time: formatTime(raw.hour, raw.minute) });
  return t("everyMinutes", { minutes: Math.max(1, Number(raw.minutes || 10)) });
}

function formatFilter(filter) {
  if (!filter || filter.mode === "none") return t("filterNone");
  const values = Array.isArray(filter.values) ? filter.values.filter(Boolean).join(", ") : "";
  const keyByMode = {
    only_contains: "filterIgnoreContains",
    contains: "filterIgnoreContains",
    ignore_contains: "filterIgnoreContains",
    only_missing: "filterIgnoreNotContains",
    only_absent: "filterIgnoreNotContains",
    not_contains: "filterIgnoreNotContains",
    ignore_not_contains: "filterIgnoreNotContains",
    only_regex: "filterIgnoreRegex",
    regex: "filterIgnoreRegex",
    ignore_regex: "filterIgnoreRegex"
  };
  const label = t(keyByMode[filter.mode] || "filterNone");
  return values ? `${label}: ${values}` : label;
}

function formatTime(hour, minute) {
  return `${String(hour ?? 9).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`;
}

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` ${type}` : ""}`;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve({ ok: false, error: "extension_context_unavailable" });
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          resolve({ ok: false, error: lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "no_response" });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
    }
  });
}
