const LISTEN_PREFIX = "monitor:";
const STORAGE_KEY = "monitors";
const PICKER_KEY = "activePicker";
const TAB_WAIT_TIMEOUT_MS = 20000;
const TAB_RENDER_DELAY_MS = 3000;
const TAB_RETRY_DELAY_MS = 1500;
const SELECTOR_WAIT_MS = 8000;
const DEBUG = true;

try {
  importScripts("localizer.js");
} catch (error) {
  console.warn("localizer.js load failed", error);
}

const localizer = globalThis.WebChangeLocalizer || null;

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

async function getTranslator() {
  if (!localizer?.createTranslator || !localizer?.getSettingsLanguage) {
    return { t: fallbackTranslate };
  }
  try {
    const preferred = await localizer.getSettingsLanguage();
    return await localizer.createTranslator(preferred || "auto");
  } catch {
    return { t: fallbackTranslate };
  }
}

function debugLog(...args) {
  if (!DEBUG) return;
  console.log("[custom-monitor]", ...args);
}

function normalizeValue(value) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFirstUrl(value) {
  const match = String(value || "").match(/url\((['"]?)(.*?)\1\)/i);
  return match && match[2] ? match[2] : "";
}

chrome.runtime.onInstalled.addListener(() => {
  rescheduleAll();
});

chrome.runtime.onStartup.addListener(() => {
  rescheduleAll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm?.name?.startsWith(LISTEN_PREFIX)) return;
  const monitorId = alarm.name.slice(LISTEN_PREFIX.length);
  enqueueCheck(monitorId);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  handleNotificationClick(notificationId).catch((error) => {
    console.warn("notification click failed", error);
  });
});

chrome.notifications.onButtonClicked.addListener((notificationId) => {
  handleNotificationClick(notificationId).catch((error) => {
    console.warn("notification button failed", error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "startPicker") {
    startPickerFlow(message.url, message.tabId, message.requestId, message.mode, message.monitorId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "pickerCancelled") {
    handlePickerCancelled(message).catch((error) => {
      console.warn("pickerCancelled failed", error);
    });
    return false;
  }

  if (message?.type === "pickerComplete") {
    completePicker(message.requestId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "forceCancelPicker") {
    forceCancelPicker(message.requestId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "saveMonitor") {
    saveMonitor(message.monitor)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "agentPreviewMonitor") {
    previewAgentMonitor(message.spec || message.payload || message.monitor || message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "agentRegisterMonitor") {
    registerAgentMonitor(message.spec || message.payload || message.monitor || message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "runMonitorNow") {
    runCheck(message.id, true)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "updateMonitor") {
    updateMonitor(message.id, message.updates || {})
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "updateMonitorFields") {
    updateMonitorFields(message.id, message.updates || {})
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "deleteMonitors") {
    deleteMonitors(message.ids || [])
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  return false;
});

let isChecking = false;
const checkQueue = [];

function enqueueCheck(monitorId) {
  if (!monitorId) return;
  if (!checkQueue.includes(monitorId)) {
    checkQueue.push(monitorId);
  }
  if (!isChecking) {
    processQueue();
  }
}

async function processQueue() {
  if (isChecking) return;
  isChecking = true;
  try {
    const monitors = await getMonitors();
    const monitorMap = new Map(monitors.map((monitor) => [monitor.id, monitor]));
    const ids = Array.from(new Set(checkQueue.splice(0)));
    const activeMonitors = ids
      .map((id) => monitorMap.get(id))
      .filter((monitor) => monitor && monitor.schedule?.enabled);

    const grouped = new Map();
    for (const monitor of activeMonitors) {
      if (!grouped.has(monitor.url)) grouped.set(monitor.url, []);
      grouped.get(monitor.url).push(monitor);
    }

    for (const [url, group] of grouped.entries()) {
      await runBatch(url, group);
    }

    await setMonitors(monitors);
  } finally {
    isChecking = false;
    if (checkQueue.length) {
      processQueue();
    }
  }
}

async function rescheduleAll() {
  const monitors = await getMonitors();
  await clearAllMonitorAlarms();
  for (const monitor of monitors) {
    scheduleMonitor(monitor);
  }
}

async function clearAllMonitorAlarms() {
  const alarms = await chrome.alarms.getAll();
  const tasks = alarms
    .filter((alarm) => alarm.name?.startsWith(LISTEN_PREFIX))
    .map((alarm) => chrome.alarms.clear(alarm.name));
  await Promise.all(tasks);
}

async function getMonitors() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function setMonitors(monitors) {
  await chrome.storage.local.set({ [STORAGE_KEY]: monitors });
}

async function saveMonitor(monitor) {
  const monitors = await getMonitors();
  if (monitor?.lastValue !== undefined) {
    monitor.lastValue = normalizeValue(monitor.lastValue);
  }
  monitors.push(monitor);
  await setMonitors(monitors);
  scheduleMonitor(monitor);
  enqueueCheck(monitor.id);
}

async function previewAgentMonitor(input) {
  const spec = normalizeAgentMonitorSpec(input);
  const result = await fetchValueViaHiddenTab(spec.url, spec.selector, spec.extract);
  const isMissing = !result?.ok && result?.error === "not_found";
  if (!result?.ok && !isMissing) {
    throw new Error(result?.error || "preview_failed");
  }

  const value = normalizeValue(result?.ok ? result.value || "" : "");
  const title = spec.title || result?.meta?.title || buildTitleFromUrl(spec.url);
  return {
    spec,
    title,
    value,
    missing: isMissing,
    meta: result?.meta || null
  };
}

async function registerAgentMonitor(input) {
  const preview = await previewAgentMonitor(input);
  const monitor = buildAgentMonitor(preview.spec, preview.value, preview.title);
  await saveMonitor(monitor);
  return { monitor, value: preview.value, missing: preview.missing };
}

function normalizeAgentMonitorSpec(input) {
  const raw = input && typeof input === "object" ? input : {};
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : raw;
  const url = String(payload.url || "").trim();
  const selector = String(payload.selector || "").trim();
  if (!isUsableUrl(url)) throw new Error("invalid_url");
  if (!selector) throw new Error("selector_required");

  const extract = normalizeAgentExtract(payload.extract);
  return {
    url,
    selector,
    title: String(payload.title || "").trim() || buildTitleFromUrl(url),
    extract,
    displayStyle: payload.displayStyle || null,
    schedule: normalizeAgentSchedule(payload.schedule),
    filter: extract.type === "image" ? null : normalizeAgentFilter(payload.filter)
  };
}

function normalizeAgentExtract(extract) {
  const raw = typeof extract === "string" ? { type: extract } : extract && typeof extract === "object" ? extract : {};
  const type = String(raw.type || "text").trim();
  const allowed = new Set(["text", "image", "value", "attr", "ownText", "textToken"]);
  const normalized = { type: allowed.has(type) ? type : "text" };
  if (normalized.type === "attr") {
    const attr = String(raw.attr || raw.name || "").trim();
    if (!attr) return { type: "text" };
    normalized.attr = attr;
  }
  if (normalized.type === "textToken") {
    normalized.index = Math.max(0, Number(raw.index || 0));
  }
  return normalized;
}

function normalizeAgentSchedule(schedule) {
  const raw = schedule && typeof schedule === "object" ? schedule : {};
  const type = String(raw.type || "interval").trim();
  const enabled = raw.enabled !== false;

  if (type === "daily") {
    return {
      enabled,
      type,
      hour: clampInteger(raw.hour, 0, 23, 9),
      minute: clampInteger(raw.minute, 0, 59, 0)
    };
  }

  if (type === "weekly") {
    return {
      enabled,
      type,
      weekday: clampInteger(raw.weekday, 0, 6, 0),
      hour: clampInteger(raw.hour, 0, 23, 9),
      minute: clampInteger(raw.minute, 0, 59, 0)
    };
  }

  if (type === "monthly") {
    return {
      enabled,
      type,
      day: clampInteger(raw.day, 1, 28, 1),
      hour: clampInteger(raw.hour, 0, 23, 9),
      minute: clampInteger(raw.minute, 0, 59, 0)
    };
  }

  const value = Number(raw.minutes || raw.value || 10);
  const unit = String(raw.unit || "minutes").trim();
  const minutes = unit === "hours" ? value * 60 : unit === "days" ? value * 1440 : value;
  return {
    enabled,
    type: "interval",
    minutes: Math.max(1, Math.round(Number.isFinite(minutes) ? minutes : 10))
  };
}

function normalizeAgentFilter(filter) {
  if (!filter || typeof filter !== "object") return null;
  const rawMode = String(filter.mode || "none").trim();
  const modeMap = {
    none: "none",
    only_contains: "ignore_contains",
    contains: "ignore_contains",
    ignore_contains: "ignore_contains",
    only_missing: "ignore_not_contains",
    only_absent: "ignore_not_contains",
    not_contains: "ignore_not_contains",
    ignore_not_contains: "ignore_not_contains",
    only_regex: "ignore_regex",
    regex: "ignore_regex",
    ignore_regex: "ignore_regex"
  };
  const mode = modeMap[rawMode] || "none";
  const values = normalizeAgentFilterValues(filter);
  if (mode === "none" || !values.length) return null;
  return { mode, values };
}

function normalizeAgentFilterValues(filter) {
  const rawValues = Array.isArray(filter.values) ? filter.values : filter.value !== undefined ? [filter.value] : [];
  return rawValues
    .flatMap((item) => String(item || "").split(/\r?\n/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAgentMonitor(spec, value, title) {
  const now = Date.now();
  return {
    id: buildRequestId(),
    url: spec.url,
    title: title || spec.title || buildTitleFromUrl(spec.url),
    selector: spec.selector,
    extract: spec.extract,
    displayStyle: spec.displayStyle || null,
    lastValue: value || "",
    previousValue: "",
    previousChangedAt: null,
    lastChangedAt: now,
    lastCheckedAt: now,
    createdAt: now,
    lastError: null,
    lastDebug: null,
    schedule: spec.schedule,
    filter: spec.filter
  };
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

async function deleteMonitors(ids) {
  if (!ids.length) return;
  const monitors = await getMonitors();
  const remaining = monitors.filter((item) => !ids.includes(item.id));
  await setMonitors(remaining);
  await Promise.all(ids.map((id) => chrome.alarms.clear(LISTEN_PREFIX + id)));
}

async function updateMonitor(id, updates) {
  if (!id) return;
  const monitors = await getMonitors();
  const monitor = monitors.find((item) => item.id === id);
  if (!monitor) return;

  if (typeof updates.enabled === "boolean") {
    monitor.enabled = updates.enabled;
  }
  if (typeof updates.scheduleEnabled === "boolean") {
    if (!monitor.schedule) {
      monitor.schedule = { enabled: updates.scheduleEnabled, type: "interval", minutes: 10 };
    } else {
      monitor.schedule.enabled = updates.scheduleEnabled;
    }
  }

  await setMonitors(monitors);

  if (monitor.schedule?.enabled) {
    scheduleMonitor(monitor);
    enqueueCheck(monitor.id);
  } else {
    await chrome.alarms.clear(LISTEN_PREFIX + monitor.id);
  }
}

function scheduleMonitor(monitor) {
  if (!monitor?.schedule?.enabled) return;
  const alarmName = LISTEN_PREFIX + monitor.id;

  if (monitor.schedule.type === "interval") {
    const minutes = Math.max(1, monitor.schedule.minutes || 10);
    chrome.alarms.create(alarmName, {
      periodInMinutes: minutes,
      delayInMinutes: minutes
    });
    return;
  }

  const next = computeNextRun(monitor.schedule);
  if (!next) return;
  chrome.alarms.create(alarmName, { when: next.getTime() });
}

function computeNextRun(schedule) {
  if (!schedule) return null;
  const now = new Date();

  if (schedule.type === "daily") {
    const target = new Date(now);
    target.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

  if (schedule.type === "weekly") {
    const target = new Date(now);
    const currentDay = target.getDay();
    const desiredDay = schedule.weekday ?? 0;
    let delta = (desiredDay - currentDay + 7) % 7;
    target.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
    if (delta === 0 && target <= now) {
      delta = 7;
    }
    target.setDate(target.getDate() + delta);
    return target;
  }

  if (schedule.type === "monthly") {
    const target = new Date(now);
    const day = Math.min(schedule.day, daysInMonth(target.getFullYear(), target.getMonth()));
    target.setDate(day);
    target.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
    if (target <= now) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextDay = Math.min(schedule.day, daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth()));
      nextMonth.setDate(nextDay);
      nextMonth.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
      return nextMonth;
    }
    return target;
  }

  return null;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

async function runCheck(monitorId, force = false) {
  const monitors = await getMonitors();
  const monitor = monitors.find((item) => item.id === monitorId);
  if (!monitor) return;
  if (!force && !monitor.schedule?.enabled) return;

  let result;
  try {
    result = await fetchValueViaHiddenTab(monitor.url, monitor.selector, monitor.extract);
  } catch (error) {
    monitor.lastError = error?.message || String(error);
    monitor.lastCheckedAt = Date.now();
    monitor.lastDebug = { ok: false, error: monitor.lastError, meta: null, ts: monitor.lastCheckedAt };
    await notifyFailure(monitor, monitor.lastError);
    await setMonitors(monitors);
    debugLog("check failed", monitor.id, monitor.lastError);
    return;
  }

  const isMissing = !result?.ok && result?.error === "not_found";
  const treatAsValueResult = Boolean(result?.ok) || isMissing;
  const newValueRaw = treatAsValueResult ? (result?.value || "") : "";
  const newValue = normalizeValue(newValueRaw);
  const prevNormalized = normalizeValue(monitor.lastValue || "");
  const now = Date.now();
  const prevCheckedAt = monitor.lastCheckedAt || null;
  const prevCheckedValue = monitor.lastValue || "";
  monitor.lastCheckedAt = now;
  monitor.lastError = treatAsValueResult ? null : result?.error || null;
  monitor.lastDebug = {
    ok: treatAsValueResult,
    error: result?.error || null,
    meta: result?.meta || null,
    ts: now
  };
  debugLog("check result", monitor.id, monitor.lastError || "ok", result?.meta || {});

  if (treatAsValueResult) {
    const filterResult = evaluateValueFilter(newValue, monitor.filter);
    if (filterResult.error) {
      monitor.lastError = filterResult.error;
      if (monitor.schedule?.enabled && monitor.schedule.type !== "interval") {
        scheduleMonitor(monitor);
      }
      await notifyFailure(monitor, monitor.lastError);
      await setMonitors(monitors);
      return;
    }
    if (filterResult.ignored) {
      monitor.lastDebug = {
        ...monitor.lastDebug,
        ignoredByFilter: true
      };
      if (monitor.schedule?.enabled && monitor.schedule.type !== "interval") {
        scheduleMonitor(monitor);
      }
      await setMonitors(monitors);
      return;
    }
    monitor.previousCheckedAt = prevCheckedAt;
    monitor.previousCheckedValue = prevCheckedValue;
    if (prevNormalized !== newValue) {
      monitor.previousValue = monitor.lastValue || "";
      monitor.previousChangedAt = monitor.lastChangedAt || null;
      monitor.lastValue = newValue;
      monitor.lastChangedAt = now;
      await notifyChange(monitor, newValue);
    } else {
      monitor.lastValue = newValue;
    }
  } else if (monitor.lastError) {
    await notifyFailure(monitor, monitor.lastError);
  }

  await setMonitors(monitors);

  if (monitor.schedule?.enabled && monitor.schedule.type !== "interval") {
    scheduleMonitor(monitor);
  }
}

async function runBatch(url, monitors) {
  if (!monitors.length) return;
  let results = [];
  try {
    results = await fetchValuesViaHiddenTab(url, monitors);
  } catch (error) {
    const now = Date.now();
    for (const monitor of monitors) {
      monitor.lastError = error?.message || String(error);
      monitor.lastCheckedAt = now;
      monitor.lastDebug = { ok: false, error: monitor.lastError, meta: null, ts: now };
      await notifyFailure(monitor, monitor.lastError);
    }
    debugLog("batch failed", url, error?.message || String(error));
    return;
  }

  const now = Date.now();
  for (let i = 0; i < monitors.length; i += 1) {
    const monitor = monitors[i];
    const result = results?.[i] || { ok: false, error: "no_result" };
    const isMissing = !result?.ok && result?.error === "not_found";
    const treatAsValueResult = Boolean(result?.ok) || isMissing;
    const newValueRaw = treatAsValueResult ? (result?.value || "") : "";
    const newValue = normalizeValue(newValueRaw);
    const prevNormalized = normalizeValue(monitor.lastValue || "");
    const prevCheckedAt = monitor.lastCheckedAt || null;
    const prevCheckedValue = monitor.lastValue || "";
    monitor.lastCheckedAt = now;
    monitor.lastError = treatAsValueResult ? null : result?.error || null;
    monitor.lastDebug = {
      ok: treatAsValueResult,
      error: result?.error || null,
      meta: result?.meta || null,
      ts: now
    };
    debugLog("batch result", monitor.id, monitor.lastError || "ok", result?.meta || {});

    if (treatAsValueResult) {
      const filterResult = evaluateValueFilter(newValue, monitor.filter);
      if (filterResult.error) {
        monitor.lastError = filterResult.error;
        if (monitor.schedule?.enabled && monitor.schedule.type !== "interval") {
          scheduleMonitor(monitor);
        }
        await notifyFailure(monitor, monitor.lastError);
        continue;
      }
      if (filterResult.ignored) {
        monitor.lastDebug = {
          ...monitor.lastDebug,
          ignoredByFilter: true
        };
        if (monitor.schedule?.enabled && monitor.schedule.type !== "interval") {
          scheduleMonitor(monitor);
        }
        continue;
      }
      monitor.previousCheckedAt = prevCheckedAt;
      monitor.previousCheckedValue = prevCheckedValue;
      if (prevNormalized !== newValue) {
        monitor.previousValue = monitor.lastValue || "";
        monitor.previousChangedAt = monitor.lastChangedAt || null;
        monitor.lastValue = newValue;
        monitor.lastChangedAt = now;
        await notifyChange(monitor, newValue);
      } else {
        monitor.lastValue = newValue;
      }
    }

    if (!treatAsValueResult && monitor.lastError) {
      await notifyFailure(monitor, monitor.lastError);
    }

    if (monitor.schedule?.enabled && monitor.schedule.type !== "interval") {
      scheduleMonitor(monitor);
    }
  }
}

function evaluateValueFilter(value, filter) {
  if (!filter || filter.mode === "none") return { ignored: false, error: null };
  const values = normalizeFilterValues(filter);
  if (!values.length) return { ignored: false, error: null };

  if (filter.mode === "ignore_regex" || filter.match === "regex") {
    let matched = false;
    for (const pattern of values) {
      try {
        if (new RegExp(pattern).test(String(value || ""))) {
          matched = true;
          break;
        }
      } catch (error) {
        return { ignored: false, error: `invalid_filter_regex: ${error?.message || String(error)}` };
      }
    }
    if (filter.mode === "ignore_regex") return { ignored: !matched, error: null };
    if (filter.mode === "ignore_contains") return { ignored: !matched, error: null };
    if (filter.mode === "ignore_not_contains") return { ignored: matched, error: null };
    return { ignored: false, error: null };
  }

  const matched = values.some((needle) => String(value || "").includes(needle));
  if (filter.mode === "ignore_contains") {
    return { ignored: !matched, error: null };
  }
  if (filter.mode === "ignore_not_contains") {
    return { ignored: matched, error: null };
  }
  return { ignored: false, error: null };
}

function normalizeFilterValues(filter) {
  if (Array.isArray(filter?.values)) {
    return filter.values.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof filter?.value === "string") {
    return filter.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

async function fetchValueViaHiddenTab(url, selector, extract) {
  const tab = await createTab({ url, active: false });
  if (!tab?.id) throw new Error("tab_create_failed");

  try {
    await waitForTabComplete(tab.id, TAB_WAIT_TIMEOUT_MS);
    await delay(TAB_RENDER_DELAY_MS);
    let result = await executeScriptOnTab(tab.id, extractValueFromPage, [selector, extract, SELECTOR_WAIT_MS]);
    if (!result?.ok) {
      await delay(TAB_RETRY_DELAY_MS);
      const retry = await executeScriptOnTab(tab.id, extractValueFromPage, [selector, extract, SELECTOR_WAIT_MS]);
      if (retry?.ok) {
        result = retry;
      }
    }
    return result || { ok: false, error: "no_result" };
  } finally {
    await removeTab(tab.id);
  }
}

async function fetchValuesViaHiddenTab(url, monitors) {
  const tab = await createTab({ url, active: false });
  if (!tab?.id) throw new Error("tab_create_failed");

  try {
    await waitForTabComplete(tab.id, TAB_WAIT_TIMEOUT_MS);
    await delay(TAB_RENDER_DELAY_MS);
    const requests = monitors.map((monitor) => ({
      selector: monitor.selector,
      extract: monitor.extract
    }));
    let result = await executeScriptOnTab(tab.id, extractValuesFromPage, [requests, SELECTOR_WAIT_MS]);
    if (Array.isArray(result) && result.some((item) => !item?.ok)) {
      await delay(TAB_RETRY_DELAY_MS);
      const retry = await executeScriptOnTab(tab.id, extractValuesFromPage, [requests, SELECTOR_WAIT_MS]);
      if (Array.isArray(retry)) {
        result = result.map((item, index) => (item?.ok ? item : retry[index] || item));
      }
    }
    return Array.isArray(result) ? result : [];
  } finally {
    await removeTab(tab.id);
  }
}

async function extractValuesFromPage(requests, timeoutMs) {
  if (!Array.isArray(requests)) return [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitMs = Number(timeoutMs) || 8000;
  const waitForSelectors = async (selectors, timeoutMs) => {
    const results = selectors.map(() => null);
    if (!selectors.length) return results;
    const start = Date.now();
    try {
      window.scrollTo(0, 0);
      window.scrollTo(0, document.body?.scrollHeight || 0);
    } catch {}

    let remaining = selectors
      .map((selector, index) => ({ selector, index }))
      .filter((item) => item.selector);

    while (remaining.length && Date.now() - start < timeoutMs) {
      remaining = remaining.filter((item) => {
        const element = document.querySelector(item.selector);
        if (element) {
          results[item.index] = element;
          return false;
        }
        return true;
      });
      if (remaining.length) {
        await sleep(250);
      }
    }
    return results;
  };

  const parseFirstUrlLocal = (value) => {
    const match = String(value || "").match(/url\((['"]?)(.*?)\1\)/i);
    return match && match[2] ? match[2] : "";
  };

  const getSvgSource = (element) => {
    if (!element || element.tagName !== "SVG") return "";
    try {
      const svgText = new XMLSerializer().serializeToString(element);
      if (!svgText) return "";
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    } catch {
      return "";
    }
  };

  const getCanvasSource = (element) => {
    if (!element || element.tagName !== "CANVAS") return "";
    try {
      return element.toDataURL("image/png");
    } catch {
      return "";
    }
  };

  const getImageLikeSource = (element) => {
    if (!element) return "";
    if (element.tagName === "IMG") {
      const src =
        element.currentSrc ||
        element.src ||
        element.getAttribute("src") ||
        element.getAttribute("data-src") ||
        element.getAttribute("data-lazy-src") ||
        "";
      if (src) return src;
    }
    if (element.tagName === "PICTURE") {
      const img = element.querySelector("img");
      if (img) {
        const imgSrc =
          img.currentSrc ||
          img.src ||
          img.getAttribute("src") ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          "";
        if (imgSrc) return imgSrc;
      }
      const source = element.querySelector("source[srcset]");
      if (source) {
        const srcset = String(source.getAttribute("srcset") || "");
        const first = srcset.split(",")[0]?.trim()?.split(/\s+/)[0] || "";
        if (first) return first;
      }
    }
    const svgSource = getSvgSource(element);
    if (svgSource) return svgSource;
    const canvasSource = getCanvasSource(element);
    if (canvasSource) return canvasSource;
    const bg = window.getComputedStyle(element).backgroundImage || "";
    return parseFirstUrlLocal(bg) || "";
  };

  const parsePseudoContent = (content) => {
    const value = String(content || "");
    if (!value || value === "none" || value === "normal") return "";
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
      return value.slice(1, -1).replace(/\\A/g, " ");
    }
    return value.replace(/\\A/g, " ");
  };

  const getPseudoText = (element) => {
    if (!element) return "";
    const before = parsePseudoContent(window.getComputedStyle(element, "::before").content);
    const after = parsePseudoContent(window.getComputedStyle(element, "::after").content);
    return `${before} ${after}`.replace(/\s+/g, " ").trim();
  };

  const getOwnText = (element) => {
    if (!element) return "";
    let value = "";
    for (const node of Array.from(element.childNodes || [])) {
      if (node.nodeType === Node.TEXT_NODE) {
        value += ` ${node.textContent || ""}`;
      }
    }
    return value.replace(/\s+/g, " ").trim();
  };

  const getTextToken = (element, index) => {
    const text = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    const tokens = text.match(/[0-9]{1,2}|[0-9]{1,3}(?:,[0-9]{3})+|[A-Za-z]+|[가-힣]+/g) || [];
    return tokens[Number(index || 0)] || "";
  };

  const baseMeta = {
    readyState: document.readyState,
    visibility: document.visibilityState,
    title: document.title,
    url: location.href
  };
  const selectors = requests.map((request) => request?.selector || "");
  const elements = await waitForSelectors(selectors, waitMs);

  return requests.map((request, index) => {
    try {
      const selector = request?.selector || "";
      const extract = request?.extract || null;
      if (!selector) return { ok: false, error: "invalid_selector" };

      const element = elements[index];
      if (!element) return { ok: false, error: "not_found", meta: { ...baseMeta, found: false } };

      let value = "";
      if (extract?.type === "image") {
        value = getImageLikeSource(element);
        if (!value) {
          const nestedMedia = element.querySelector("img, picture, svg, canvas");
          value = nestedMedia ? getImageLikeSource(nestedMedia) : "";
        }
        if (!value && element.shadowRoot) {
          const shadowMedia = element.shadowRoot.querySelector("img, picture, svg, canvas");
          value = shadowMedia ? getImageLikeSource(shadowMedia) : "";
        }
      } else if (extract?.type === "value") {
        value = element.value ?? element.getAttribute("value") ?? "";
        if (!value && element.shadowRoot) {
          const valueNode = element.shadowRoot.querySelector("input, textarea, select, [value]");
          if (valueNode) {
            value = valueNode.value ?? valueNode.getAttribute?.("value") ?? "";
          }
        }
      } else if (extract?.type === "attr") {
        value = element.getAttribute(extract.attr || "") ?? "";
        if (!value && element.shadowRoot && extract.attr) {
          try {
            const attrName = String(extract.attr).replace(/"/g, '\\"');
            const attrNode = element.shadowRoot.querySelector(`[${attrName}]`);
            if (attrNode) value = attrNode.getAttribute(extract.attr) ?? "";
          } catch {}
        }
      } else if (extract?.type === "ownText") {
        value = getOwnText(element);
      } else if (extract?.type === "textToken") {
        value = getTextToken(element, extract.index);
      } else {
        value = element.innerText || "";
        if (!value && element.shadowRoot) {
          value = element.shadowRoot.textContent || "";
        }
        if (!value) value = element.textContent || "";
        if (!value) value = getPseudoText(element);
      }

      if (!value && extract?.type !== "text" && extract?.type !== "image" && extract?.type !== "ownText" && extract?.type !== "textToken") {
        value = element.innerText || "";
        if (!value && element.shadowRoot) {
          value = element.shadowRoot.textContent || "";
        }
        if (!value) value = element.textContent || "";
        if (!value) value = getPseudoText(element);
      }

      const trimmed = String(value).trim();
      return {
        ok: true,
        value: trimmed,
        meta: { ...baseMeta, found: true, length: trimmed.length }
      };
    } catch (error) {
      return { ok: false, error: error?.message || String(error), meta: baseMeta };
    }
  });
}

async function extractValueFromPage(selector, extract, timeoutMs) {
  try {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitMs = Number(timeoutMs) || 8000;
    const waitForSelector = async (selectorValue, timeoutMs) => {
      if (!selectorValue) return null;
      const start = Date.now();
      let element = document.querySelector(selectorValue);
      if (element) return element;
      try {
        window.scrollTo(0, 0);
        window.scrollTo(0, document.body?.scrollHeight || 0);
      } catch {}
      while (Date.now() - start < timeoutMs) {
        await sleep(250);
        element = document.querySelector(selectorValue);
        if (element) return element;
      }
      return null;
    };

    const parseFirstUrlLocal = (value) => {
      const match = String(value || "").match(/url\((['"]?)(.*?)\1\)/i);
      return match && match[2] ? match[2] : "";
    };

    const getSvgSource = (element) => {
      if (!element || element.tagName !== "SVG") return "";
      try {
        const svgText = new XMLSerializer().serializeToString(element);
        if (!svgText) return "";
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      } catch {
        return "";
      }
    };

    const getCanvasSource = (element) => {
      if (!element || element.tagName !== "CANVAS") return "";
      try {
        return element.toDataURL("image/png");
      } catch {
        return "";
      }
    };

    const getImageLikeSource = (element) => {
      if (!element) return "";
      if (element.tagName === "IMG") {
        const src =
          element.currentSrc ||
          element.src ||
          element.getAttribute("src") ||
          element.getAttribute("data-src") ||
          element.getAttribute("data-lazy-src") ||
          "";
        if (src) return src;
      }
      if (element.tagName === "PICTURE") {
        const img = element.querySelector("img");
        if (img) {
          const imgSrc =
            img.currentSrc ||
            img.src ||
            img.getAttribute("src") ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-lazy-src") ||
            "";
          if (imgSrc) return imgSrc;
        }
        const source = element.querySelector("source[srcset]");
        if (source) {
          const srcset = String(source.getAttribute("srcset") || "");
          const first = srcset.split(",")[0]?.trim()?.split(/\s+/)[0] || "";
          if (first) return first;
        }
      }
      const svgSource = getSvgSource(element);
      if (svgSource) return svgSource;
      const canvasSource = getCanvasSource(element);
      if (canvasSource) return canvasSource;
      const bg = window.getComputedStyle(element).backgroundImage || "";
      return parseFirstUrlLocal(bg) || "";
    };

    const parsePseudoContent = (content) => {
      const value = String(content || "");
      if (!value || value === "none" || value === "normal") return "";
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
        return value.slice(1, -1).replace(/\\A/g, " ");
      }
      return value.replace(/\\A/g, " ");
    };

    const getPseudoText = (element) => {
      if (!element) return "";
      const before = parsePseudoContent(window.getComputedStyle(element, "::before").content);
      const after = parsePseudoContent(window.getComputedStyle(element, "::after").content);
      return `${before} ${after}`.replace(/\s+/g, " ").trim();
    };

    const getOwnText = (element) => {
      if (!element) return "";
      let value = "";
      for (const node of Array.from(element.childNodes || [])) {
        if (node.nodeType === Node.TEXT_NODE) {
          value += ` ${node.textContent || ""}`;
        }
      }
      return value.replace(/\s+/g, " ").trim();
    };

    const getTextToken = (element, index) => {
      const text = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      const tokens = text.match(/[0-9]{1,2}|[0-9]{1,3}(?:,[0-9]{3})+|[A-Za-z]+|[가-힣]+/g) || [];
      return tokens[Number(index || 0)] || "";
    };

    const baseMeta = {
      readyState: document.readyState,
      visibility: document.visibilityState,
      title: document.title,
      url: location.href
    };
    const element = await waitForSelector(selector, waitMs);
    if (!element) return { ok: false, error: "not_found", meta: { ...baseMeta, found: false } };

    let value = "";
    if (extract?.type === "image") {
      value = getImageLikeSource(element);
      if (!value) {
        const nestedMedia = element.querySelector("img, picture, svg, canvas");
        value = nestedMedia ? getImageLikeSource(nestedMedia) : "";
      }
      if (!value && element.shadowRoot) {
        const shadowMedia = element.shadowRoot.querySelector("img, picture, svg, canvas");
        value = shadowMedia ? getImageLikeSource(shadowMedia) : "";
      }
    } else if (extract?.type === "value") {
      value = element.value ?? element.getAttribute("value") ?? "";
      if (!value && element.shadowRoot) {
        const valueNode = element.shadowRoot.querySelector("input, textarea, select, [value]");
        if (valueNode) {
          value = valueNode.value ?? valueNode.getAttribute?.("value") ?? "";
        }
      }
    } else if (extract?.type === "attr") {
      value = element.getAttribute(extract.attr || "") ?? "";
      if (!value && element.shadowRoot && extract.attr) {
        try {
          const attrName = String(extract.attr).replace(/"/g, '\\"');
          const attrNode = element.shadowRoot.querySelector(`[${attrName}]`);
          if (attrNode) value = attrNode.getAttribute(extract.attr) ?? "";
        } catch {}
      }
    } else if (extract?.type === "ownText") {
      value = getOwnText(element);
    } else if (extract?.type === "textToken") {
      value = getTextToken(element, extract.index);
    } else {
      value = element.innerText || "";
      if (!value && element.shadowRoot) {
        value = element.shadowRoot.textContent || "";
      }
      if (!value) value = element.textContent || "";
      if (!value) value = getPseudoText(element);
    }

    if (!value && extract?.type !== "text" && extract?.type !== "image" && extract?.type !== "ownText" && extract?.type !== "textToken") {
      value = element.innerText || "";
      if (!value && element.shadowRoot) {
        value = element.shadowRoot.textContent || "";
      }
      if (!value) value = element.textContent || "";
      if (!value) value = getPseudoText(element);
    }

    const trimmed = String(value).trim();
    return { ok: true, value: trimmed, meta: { ...baseMeta, found: true, length: trimmed.length } };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), meta: null };
  }
}

async function notifyChange(monitor, value) {
  const translator = await getTranslator();
  const tr = translator?.t || fallbackTranslate;
  const title = truncate((monitor.title || monitor.url || "Web Change Alert").replace(/\s+/g, " "), 60);
  const prev = normalizeValue(monitor.previousValue || tr("notificationPrevEmpty"));
  const next = normalizeValue(value || tr("notificationValueEmpty"));
  const imageUrl = resolveImageUrl(next, monitor?.url);
  const isImageMonitor = monitor?.extract?.type === "image" || Boolean(imageUrl);
  const message = isImageMonitor
    ? `${formatNotificationValue(prev, true, tr, monitor?.url)} -> ${formatNotificationValue(next, true, tr, monitor?.url)}`
    : `${truncate(formatNotificationValue(prev, false, tr, monitor?.url), 30)} -> ${truncate(formatNotificationValue(next, false, tr, monitor?.url), 30)}`.replace(/\s+/g, " ");
  const notificationId = `monitor_${monitor.id}_${Date.now()}`;

  const payload = {
    type: imageUrl ? "image" : "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    requireInteraction: false
  };
  if (imageUrl) {
    payload.imageUrl = imageUrl;
  }
  chrome.notifications.create(notificationId, payload);
}

async function notifyFailure(monitor, errorMessage) {
  const translator = await getTranslator();
  const tr = translator?.t || fallbackTranslate;
  const title = truncate((monitor.title || monitor.url || "Web Change Alert").replace(/\s+/g, " "), 60);
  const reason = normalizeValue(errorMessage || tr("notificationFailureUnknown"));
  const message = `${tr("notificationFailureReselect")}: ${truncate(reason, 42)}`.replace(/\s+/g, " ");
  const notificationId = `monitor_fail_${monitor.id}_${Date.now()}`;

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    buttons: [{ title: tr("reselect") }],
    requireInteraction: false
  });
}

function formatNotificationValue(value, preferImage, tr = fallbackTranslate, baseUrl = "") {
  const normalized = normalizeValue(value || "");
  if (!normalized) return tr("notificationValueEmpty");
  if (preferImage || resolveImageUrl(normalized, baseUrl)) {
    return formatImageLabel(normalized, tr, baseUrl);
  }
  return normalized.replace(/\s+/g, " ");
}

function formatImageLabel(value, tr = fallbackTranslate, baseUrl = "") {
  if (!value) return tr("imageLabel");
  if (/^data:image\//i.test(value)) return "data:image";
  try {
    const resolved = resolveImageUrl(value, baseUrl) || value;
    const parsed = new URL(resolved, "http://localhost");
    const fileName = parsed.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(fileName || parsed.hostname || tr("imageLabel"));
  } catch {
    return tr("imageLabel");
  }
}

function resolveImageUrl(value, baseUrl) {
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

function parseNotificationTarget(notificationId) {
  const text = String(notificationId || "");
  const fail = /^monitor_fail_(.+)_\d+$/.exec(text);
  if (fail) return { kind: "failure", monitorId: fail[1] };
  const change = /^monitor_(.+)_\d+$/.exec(text);
  if (change) return { kind: "change", monitorId: change[1] };
  return { kind: "", monitorId: "" };
}

async function handleNotificationClick(notificationId) {
  const target = parseNotificationTarget(notificationId);
  if (!target.monitorId) return;
  if (target.kind === "failure") {
    await openMonitorReselect(target.monitorId);
  } else {
    await openMonitorUrl(target.monitorId);
  }
  chrome.notifications.clear(notificationId);
}

async function openMonitorUrl(monitorId) {
  const monitors = await getMonitors();
  const monitor = monitors.find((item) => item.id === monitorId);
  if (monitor?.url) {
    chrome.tabs.create({ url: monitor.url });
  }
}

async function openMonitorReselect(monitorId) {
  const monitors = await getMonitors();
  const monitor = monitors.find((item) => item.id === monitorId);
  if (!monitor?.url) return;
  await startPickerFlow(monitor.url, null, buildRequestId(), "update", monitor.id);
}

function truncate(value, maxLength) {
  if (!value) return "";
  return value.length > maxLength ? value.slice(0, maxLength - 1) + "…" : value;
}

function buildRequestId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function startPickerFlow(url, tabId, requestId, mode = "create", monitorId = null) {
  const targetUrl = await resolvePickerUrl(url, tabId);
  if (!targetUrl) throw new Error("url_required");
  const pickerMode = mode === "update" && monitorId ? "update" : "create";
  const pickerMonitorId = pickerMode === "update" ? monitorId : null;

  const existingTab = tabId ? await getTab(tabId).catch(() => null) : null;
  const useExisting =
    existingTab &&
    isUsableUrl(existingTab.url) &&
    (!url || normalizeUrl(existingTab.url) === normalizeUrl(targetUrl));

  let pickTabId = existingTab?.id;
  let closeOnDone = false;

  if (!useExisting) {
    const pickTab = await createTab({ url: targetUrl, active: true });
    if (!pickTab?.id) throw new Error("tab_create_failed");
    pickTabId = pickTab.id;
    closeOnDone = true;
  }

  await chrome.storage.local.set({
    [PICKER_KEY]: {
      requestId,
      tabId: pickTabId,
      closeOnDone,
      mode: pickerMode,
      monitorId: pickerMonitorId
    }
  });

  if (!useExisting || existingTab?.status !== "complete") {
    await waitForTabComplete(pickTabId, TAB_WAIT_TIMEOUT_MS);
  }
  await chrome.scripting.insertCSS({ target: { tabId: pickTabId }, files: ["picker.css"] });
  await chrome.scripting.executeScript({ target: { tabId: pickTabId }, files: ["localizer.js", "picker.js"] });

}

async function updateMonitorFields(id, updates) {
  if (!id) return;
  const monitors = await getMonitors();
  const monitor = monitors.find((item) => item.id === id);
  if (!monitor) return;

  const allowed = [
    "selector",
    "extract",
    "displayStyle",
    "title",
    "lastValue",
    "lastChangedAt",
    "lastCheckedAt",
    "previousValue",
    "previousChangedAt",
    "previousCheckedValue",
    "previousCheckedAt",
    "lastError",
    "lastDebug",
    "filter",
    "schedule",
    "url"
  ];
  for (const key of allowed) {
    if (key in updates) {
      monitor[key] = updates[key];
    }
  }

  await setMonitors(monitors);
  if ("schedule" in updates) {
    await chrome.alarms.clear(LISTEN_PREFIX + monitor.id);
    if (monitor.schedule?.enabled) {
      scheduleMonitor(monitor);
    }
  }
}

async function handlePickerCancelled(message) {
  const data = await chrome.storage.local.get([PICKER_KEY]);
  const pick = data[PICKER_KEY];
  if (!pick || pick.requestId !== message.requestId) return;

  await chrome.storage.local.remove(PICKER_KEY);
  if (pick.closeOnDone && pick.tabId) {
    await removeTab(pick.tabId);
  }
}

async function completePicker(requestId) {
  const data = await chrome.storage.local.get([PICKER_KEY]);
  const pick = data[PICKER_KEY];
  if (!pick || pick.requestId !== requestId) return;

  await chrome.storage.local.remove(PICKER_KEY);
  if (pick.closeOnDone && pick.tabId) {
    await removeTab(pick.tabId);
  }
}

async function forceCancelPicker(requestId) {
  const data = await chrome.storage.local.get([PICKER_KEY]);
  const pick = data[PICKER_KEY];
  if (!pick || pick.requestId !== requestId) return;

  await chrome.storage.local.remove(PICKER_KEY);
  if (pick.closeOnDone && pick.tabId) {
    await removeTab(pick.tabId);
  }
}


async function resolvePickerUrl(url, tabId) {
  if (url && isUsableUrl(url)) return url;
  if (tabId) {
    const tab = await getTab(tabId).catch(() => null);
    if (tab?.url && isUsableUrl(tab.url)) return tab.url;
  }
  return null;
}

function isUsableUrl(url) {
  if (!url) return false;
  return /^https?:/i.test(url);
}

function normalizeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

function buildTitleFromUrl(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function createTab(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => resolve());
  });
}

function executeScriptOnTab(tabId, func, args = []) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId }, func, args },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(results?.[0]?.result || null);
      }
    );
  });
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("tab_load_timeout"));
    }, timeoutMs);

    function handleUpdated(updatedTabId, info) {
      if (updatedTabId !== tabId) return;
      if (info.status === "complete") {
        cleanup();
        resolve();
      }
    }

    function handleRemoved(removedTabId) {
      if (removedTabId !== tabId) return;
      cleanup();
      reject(new Error("tab_closed"));
    }

    function cleanup() {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
    }

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved.addListener(handleRemoved);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
