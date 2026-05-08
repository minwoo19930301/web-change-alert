const manifest = chrome.runtime.getManifest();
const MANIFEST_NAME = manifest?.name || "Web Change Alert";
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
const confirmBack = document.getElementById("confirmBack");
const confirmClose = document.getElementById("confirmClose");
const confirmCancel = document.getElementById("confirmCancel");
const confirmDelete = document.getElementById("confirmDelete");
const editorOverlay = document.getElementById("editorOverlay");
const editorDialog = document.getElementById("editorDialog");

const langBtn = document.getElementById("langBtn");
const langMenu = document.getElementById("langMenu");
const langOptionsWrap = document.getElementById("langOptions");

const aboutBtn = document.getElementById("aboutBtn");
const aboutOverlay = document.getElementById("aboutOverlay");
const aboutBack = document.getElementById("aboutBack");
const aboutCloseIcon = document.getElementById("aboutCloseIcon");
const aboutClose = document.getElementById("aboutClose");
const noticeText = document.getElementById("noticeText");
const aboutAppName = document.getElementById("aboutAppName");
const aboutVersion = document.getElementById("aboutVersion");
const aboutAuthor = document.getElementById("aboutAuthor");
const helpGuides = document.getElementById("helpGuides");

const HELP_GUIDES = [
  {
    titleKey: "helpNotificationsMissingTitle",
    pathKeys: ["helpNotificationsMissingMac", "helpNotificationsMissingWindows"],
    inlineLinks: [
      {
        labelKey: "helpOpenMacGuide",
        text: "support.proctorexam.com/.../Enable-Notifications-on-Google-Chrome-Mac",
        url: "https://support.proctorexam.com/hc/en-us/articles/36135749973645-Enable-Notifications-on-Google-Chrome-Mac"
      },
      {
        labelKey: "helpOpenWindowsGuide",
        text: "support.proctorexam.com/.../Enable-Notifications-on-Google-Chrome-Windows",
        url: "https://support.proctorexam.com/hc/en-us/articles/36135772325645-Enable-Notifications-on-Google-Chrome-Windows"
      }
    ]
  },
  {
    titleKey: "helpUnexpectedTitle",
    bodyKeys: ["helpUnexpectedIntro", "helpUnexpectedAction"],
    inlineLinks: [
      {
        labelKey: "helpUnexpectedChromePath",
        text: "chrome://settings/content/notifications",
        url: "chrome://settings/content/notifications"
      }
    ]
  }
];

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
    let template = safeGetMessage(key) || key;
    for (const [name, value] of Object.entries(vars)) {
      template = template.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
    return template;
  },
  effective: normalizeUiLocaleTag(safeGetUiLanguage() || "en"),
  isRtl: false
};

function safeGetMessage(key) {
  try {
    return chrome.i18n?.getMessage?.(key) || "";
  } catch {
    return "";
  }
}

function safeGetUiLanguage() {
  try {
    return chrome.i18n?.getUILanguage?.() || "";
  } catch {
    return "";
  }
}

bindEvents();
init();

function bindEvents() {
  addBtn.addEventListener("click", () => {
    setAddSectionVisible(true);
  });

  confirmCancel.addEventListener("click", () => {
    closeConfirm();
  });
  confirmBack?.addEventListener("click", () => {
    closeConfirm();
  });
  confirmClose?.addEventListener("click", () => {
    closeConfirm();
  });

  confirmOverlay.addEventListener("click", (event) => {
    if (event.target === confirmOverlay) {
      closeConfirm();
    }
  });

  editorOverlay.addEventListener("click", (event) => {
    if (event.target === editorOverlay) {
      closeEditor();
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
      tabId: activeTab?.id,
      mode: "create",
      monitorId: null
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
      closeAbout();
    }
  });

  aboutClose.addEventListener("click", () => {
    closeAbout();
  });
  aboutBack?.addEventListener("click", () => {
    closeAbout();
  });
  aboutCloseIcon?.addEventListener("click", () => {
    closeAbout();
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
  document.documentElement.lang = normalizeUiLocaleTag(translator?.effective || safeGetUiLanguage() || "en");
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
  const i18nTitleNodes = document.querySelectorAll("[data-i18n-title]");
  for (const node of i18nTitleNodes) {
    const key = node.getAttribute("data-i18n-title");
    if (!key) continue;
    const text = t(key);
    node.title = text;
    node.setAttribute("aria-label", text);
  }

  noticeText.textContent = t("notice");
  aboutAppName.textContent = t("extensionName") || MANIFEST_NAME;
  aboutVersion.textContent = APP_VERSION;
  aboutAuthor.textContent = AUTHOR_NAME;
  renderHelpGuides();
}

function renderHelpGuides() {
  if (!helpGuides) return;
  helpGuides.innerHTML = "";

  for (const guide of HELP_GUIDES) {
    const card = document.createElement("section");
    card.className = "help-card";

    const title = document.createElement("div");
    title.className = "help-card-title";
    title.textContent = t(guide.titleKey);
    card.appendChild(title);

    const copy = document.createElement("div");
    copy.className = "help-card-copy";
    for (const key of guide.bodyKeys || []) {
      const line = document.createElement("div");
      line.textContent = t(key);
      copy.appendChild(line);
    }
    if (Array.isArray(guide.pathKeys) && guide.pathKeys.length) {
      const pathList = document.createElement("div");
      pathList.className = "help-paths";
      for (const key of guide.pathKeys) {
        const path = document.createElement("div");
        path.className = "help-path";
        path.textContent = t(key);
        pathList.appendChild(path);
      }
      copy.appendChild(pathList);
    }
    if (Array.isArray(guide.inlineLinks) && guide.inlineLinks.length) {
      for (const linkInfo of guide.inlineLinks) {
        const row = document.createElement("div");
        row.className = "help-inline-link-row";

        const label = document.createElement("div");
        label.textContent = t(linkInfo.labelKey);
        row.appendChild(label);

        const link = document.createElement("a");
        link.className = "help-inline-link";
        link.href = linkInfo.url;
        link.textContent = linkInfo.text;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          openGuideUrl(linkInfo.url);
        });
        row.appendChild(link);
        copy.appendChild(row);
      }
    }
    card.appendChild(copy);
    helpGuides.appendChild(card);
  }
}

function openGuideUrl(url) {
  if (!url) return;
  chrome.tabs.create({ url });
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
    const filterText = formatFilter(monitor.filter);
    if (filterText) {
      const filterTag = document.createElement("span");
      filterTag.className = "tag";
      filterTag.textContent = filterText;
      left.appendChild(filterTag);
    }

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

    const scheduleBtn = document.createElement("button");
    scheduleBtn.className = "icon-action-btn";
    scheduleBtn.type = "button";
    scheduleBtn.title = t("editSchedule");
    scheduleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 7v5l3 2"></path>
      </svg>
    `;
    scheduleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openScheduleEditor(monitor);
    });

    const filterBtn = document.createElement("button");
    filterBtn.className = "icon-action-btn";
    filterBtn.type = "button";
    filterBtn.title = t("filterLabel");
    filterBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 5h16l-6 7v5l-4 2v-7z"></path>
      </svg>
    `;
    filterBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openFilterEditor(monitor);
    });

    const reselectBtn = document.createElement("button");
    reselectBtn.className = "icon-action-btn";
    reselectBtn.type = "button";
    reselectBtn.title = t("reselect");
    reselectBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M12 2v4"></path>
        <path d="M12 18v4"></path>
        <path d="M2 12h4"></path>
        <path d="M18 12h4"></path>
      </svg>
    `;
    reselectBtn.addEventListener("click", async (event) => {
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
    actions.appendChild(scheduleBtn);
    if (!isImageMonitor(monitor)) {
      actions.appendChild(filterBtn);
    }
    actions.appendChild(reselectBtn);
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

function buildModalHeader(titleText, onBack, onClose) {
  const header = document.createElement("div");
  header.className = "modal-header";

  const back = document.createElement("button");
  back.className = "modal-icon";
  back.type = "button";
  back.textContent = "‹";
  back.title = t("back");
  back.setAttribute("aria-label", t("back"));
  back.addEventListener("click", onBack);

  const title = document.createElement("div");
  title.className = "schedule-inline-title";
  title.textContent = titleText;

  const close = document.createElement("button");
  close.className = "modal-icon";
  close.type = "button";
  close.textContent = "×";
  close.title = t("close");
  close.setAttribute("aria-label", t("close"));
  close.addEventListener("click", onClose);

  header.appendChild(back);
  header.appendChild(title);
  header.appendChild(close);
  return header;
}

function buildInlineScheduleEditor(monitor) {
  const panel = document.createElement("div");
  panel.className = "schedule-inline";

  const header = buildModalHeader(t("editScheduleTitle"), closeScheduleEditor, closeScheduleEditor);

  const form = document.createElement("div");
  form.className = "schedule-form";

  const row = document.createElement("div");
  row.className = "schedule-row";

  const typeSelect = buildSelect([
    ["interval", t("scheduleInterval")],
    ["daily", t("scheduleDaily")],
    ["weekly", t("scheduleWeekly")],
    ["monthly", t("scheduleMonthly")]
  ]);
  const intervalValue = document.createElement("input");
  intervalValue.type = "number";
  intervalValue.min = "1";
  intervalValue.value = "10";
  const intervalUnit = buildSelect([
    ["minutes", t("minute")],
    ["hours", t("hour")],
    ["days", t("day")]
  ]);

  row.appendChild(typeSelect);
  row.appendChild(intervalValue);
  row.appendChild(intervalUnit);

  const dailyTime = document.createElement("input");
  dailyTime.type = "time";
  dailyTime.value = "09:00";

  const weeklyFields = document.createElement("div");
  weeklyFields.className = "schedule-two";
  const weeklyDay = buildSelect([0, 1, 2, 3, 4, 5, 6].map((day) => [String(day), t(`weekday${day}`)]));
  const weeklyTime = document.createElement("input");
  weeklyTime.type = "time";
  weeklyTime.value = "09:00";
  weeklyFields.appendChild(weeklyDay);
  weeklyFields.appendChild(weeklyTime);

  const monthlyFields = document.createElement("div");
  monthlyFields.className = "schedule-two";
  const monthlyDay = document.createElement("input");
  monthlyDay.type = "number";
  monthlyDay.min = "1";
  monthlyDay.max = "28";
  monthlyDay.value = "1";
  const monthlyTime = document.createElement("input");
  monthlyTime.type = "time";
  monthlyTime.value = "09:00";
  monthlyFields.appendChild(monthlyDay);
  monthlyFields.appendChild(monthlyTime);

  form.appendChild(row);
  form.appendChild(dailyTime);
  form.appendChild(weeklyFields);
  form.appendChild(monthlyFields);

  const actions = document.createElement("div");
  actions.className = "schedule-inline-actions";
  const cancel = document.createElement("button");
  cancel.className = "secondary";
  cancel.type = "button";
  cancel.textContent = t("cancel");
  const save = document.createElement("button");
  save.className = "primary";
  save.type = "button";
  save.textContent = t("save");
  actions.appendChild(cancel);
  actions.appendChild(save);

  panel.appendChild(header);
  panel.appendChild(form);
  panel.appendChild(actions);

  const controls = {
    typeSelect,
    row,
    intervalValue,
    intervalUnit,
    dailyTime,
    weeklyFields,
    weeklyDay,
    weeklyTime,
    monthlyFields,
    monthlyDay,
    monthlyTime
  };
  fillInlineScheduleEditor(controls, monitor?.schedule || { enabled: true, type: "interval", minutes: 10 });

  typeSelect.addEventListener("change", () => updateInlineScheduleFields(controls));
  cancel.addEventListener("click", () => closeScheduleEditor());
  save.addEventListener("click", async () => {
    const schedule = buildScheduleFromControls(controls, monitor?.schedule?.enabled !== false);
    const response = await chrome.runtime.sendMessage({
      type: "updateMonitorFields",
      id: monitor.id,
      updates: { schedule }
    });
    if (response?.ok) {
      closeEditor();
      init();
    }
  });

  return panel;
}

function buildInlineFilterEditor(monitor) {
  const panel = document.createElement("div");
  panel.className = "schedule-inline filter-inline";

  const header = buildModalHeader(t("filterLabel"), closeFilterEditor, closeFilterEditor);

  const form = document.createElement("div");
  form.className = "filter-form";

  const modeSelect = buildSelect([
    ["none", t("filterNone")],
    ["ignore_contains", t("filterIgnoreContains")],
    ["ignore_not_contains", t("filterIgnoreNotContains")],
    ["ignore_regex", t("filterIgnoreRegex")]
  ]);

  const tokenWrap = document.createElement("div");
  tokenWrap.className = "filter-token-input";
  const input = document.createElement("input");
  input.className = "filter-token-field";
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = t("filterValuesPlaceholder");
  tokenWrap.appendChild(input);

  const values = getFilterValues(monitor.filter);
  let composingValue = false;

  form.appendChild(modeSelect);
  form.appendChild(tokenWrap);

  const actions = document.createElement("div");
  actions.className = "schedule-inline-actions";
  const cancel = document.createElement("button");
  cancel.className = "secondary";
  cancel.type = "button";
  cancel.textContent = t("cancel");
  const save = document.createElement("button");
  save.className = "primary";
  save.type = "button";
  save.textContent = t("save");
  actions.appendChild(cancel);
  actions.appendChild(save);

  panel.appendChild(header);
  panel.appendChild(form);
  panel.appendChild(actions);

  modeSelect.value = normalizeFilterMode(monitor.filter);

  function renderTokens() {
    tokenWrap.querySelectorAll(".filter-token").forEach((node) => node.remove());
    for (const value of values) {
      const token = document.createElement("span");
      token.className = "filter-token";
      token.dataset.value = value;

      const text = document.createElement("span");
      text.className = "filter-token-text";
      text.textContent = value;
      token.appendChild(text);

      const remove = document.createElement("button");
      remove.className = "filter-token-remove";
      remove.type = "button";
      remove.textContent = "x";
      remove.title = t("delete");
      remove.addEventListener("click", () => {
        const index = values.indexOf(value);
        if (index >= 0) values.splice(index, 1);
        renderTokens();
        input.focus();
      });
      token.appendChild(remove);
      tokenWrap.insertBefore(token, input);
    }
  }

  function addValue(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return;
    if (!values.includes(value)) values.push(value);
    input.value = "";
    renderTokens();
  }

  function updateVisibility() {
    tokenWrap.classList.toggle("schedule-hidden", modeSelect.value === "none");
  }

  tokenWrap.addEventListener("click", () => input.focus());
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || composingValue) return;
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addValue(input.value);
      return;
    }
    if (event.key === "Backspace" && !input.value && values.length) {
      values.pop();
      renderTokens();
    }
  });
  input.addEventListener("blur", () => addValue(input.value));
  input.addEventListener("compositionstart", () => {
    composingValue = true;
  });
  input.addEventListener("compositionend", () => {
    composingValue = false;
  });
  input.addEventListener("keyup", (event) => {
    if (event.key !== "Enter" || event.isComposing || composingValue) return;
    event.preventDefault();
    addValue(input.value);
  });
  modeSelect.addEventListener("change", updateVisibility);
  cancel.addEventListener("click", () => closeFilterEditor());
  save.addEventListener("click", async () => {
    addValue(input.value);
    const filter = buildFilterFromControls(modeSelect.value, values);
    const response = await chrome.runtime.sendMessage({
      type: "updateMonitorFields",
      id: monitor.id,
      updates: { filter }
    });
    if (response?.ok) {
      closeEditor();
      init();
    }
  });

  renderTokens();
  updateVisibility();
  return panel;
}

function buildSelect(options) {
  const select = document.createElement("select");
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  return select;
}

function fillInlineScheduleEditor(controls, schedule) {
  const normalized = schedule || { enabled: true, type: "interval", minutes: 10 };
  controls.typeSelect.value = normalized.type || "interval";

  if (normalized.type === "interval") {
    const decomposed = decomposeInterval(normalized.minutes || 10);
    controls.intervalValue.value = String(decomposed.value);
    controls.intervalUnit.value = decomposed.unit;
  }
  if (normalized.type === "daily") {
    controls.dailyTime.value = `${pad(normalized.hour)}:${pad(normalized.minute)}`;
  }
  if (normalized.type === "weekly") {
    controls.weeklyDay.value = String(normalized.weekday ?? 0);
    controls.weeklyTime.value = `${pad(normalized.hour)}:${pad(normalized.minute)}`;
  }
  if (normalized.type === "monthly") {
    controls.monthlyDay.value = String(Math.min(28, Math.max(1, Number(normalized.day || 1))));
    controls.monthlyTime.value = `${pad(normalized.hour)}:${pad(normalized.minute)}`;
  }

  updateInlineScheduleFields(controls);
}

function updateInlineScheduleFields(controls) {
  const type = controls.typeSelect.value || "interval";
  controls.row.classList.toggle("single", type !== "interval");
  controls.dailyTime.classList.toggle("schedule-hidden", type !== "daily");
  controls.weeklyFields.classList.toggle("schedule-hidden", type !== "weekly");
  controls.monthlyFields.classList.toggle("schedule-hidden", type !== "monthly");
}

function buildScheduleFromControls(controls, enabled) {
  const type = controls.typeSelect.value || "interval";
  if (type === "interval") {
    const value = Math.max(1, Number(controls.intervalValue.value || 1));
    const unit = controls.intervalUnit.value || "minutes";
    const minutes = unit === "hours" ? value * 60 : unit === "days" ? value * 1440 : value;
    return { enabled, type, minutes };
  }
  if (type === "daily") {
    const [hour, minute] = parseTime(controls.dailyTime.value);
    return { enabled, type, hour, minute };
  }
  if (type === "weekly") {
    const [hour, minute] = parseTime(controls.weeklyTime.value);
    const weekday = Number(controls.weeklyDay.value || 0);
    return { enabled, type, weekday, hour, minute };
  }
  if (type === "monthly") {
    const [hour, minute] = parseTime(controls.monthlyTime.value);
    const day = Math.min(28, Math.max(1, Number(controls.monthlyDay.value || 1)));
    return { enabled, type, day, hour, minute };
  }
  return { enabled, type: "interval", minutes: 10 };
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

function isImageMonitor(monitor) {
  return monitor?.extract?.type === "image";
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

function closeAbout() {
  aboutOverlay.classList.add("hidden");
}

function openScheduleEditor(monitor) {
  if (!monitor) return;
  editorDialog.innerHTML = "";
  editorDialog.appendChild(buildInlineScheduleEditor(monitor));
  editorOverlay.classList.remove("hidden");
}

function closeScheduleEditor() {
  closeEditor();
}

function openFilterEditor(monitor) {
  if (isImageMonitor(monitor)) return;
  editorDialog.innerHTML = "";
  editorDialog.appendChild(buildInlineFilterEditor(monitor));
  editorOverlay.classList.remove("hidden");
}

function closeFilterEditor() {
  closeEditor();
}

function closeEditor() {
  editorOverlay.classList.add("hidden");
  editorDialog.innerHTML = "";
}

function decomposeInterval(minutes) {
  const total = Math.max(1, Number(minutes || 10));
  if (total % 1440 === 0) return { value: total / 1440, unit: "days" };
  if (total % 60 === 0) return { value: total / 60, unit: "hours" };
  return { value: total, unit: "minutes" };
}

function parseTime(value) {
  const [hour, minute] = String(value || "09:00").split(":");
  return [Number(hour || 0), Number(minute || 0)];
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

function formatFilter(filter) {
  const values = getFilterValues(filter);
  if (!filter || filter.mode === "none" || !values.length) return "";
  const valueText = values.join(", ");
  if (filter.mode === "ignore_regex" || filter.match === "regex") {
    return `${t("filterIgnoreRegex")}: ${valueText}`;
  }
  if (filter.mode === "ignore_contains") {
    return `${t("filterIgnoreContains")}: ${valueText}`;
  }
  if (filter.mode === "ignore_not_contains") {
    return `${t("filterIgnoreNotContains")}: ${valueText}`;
  }
  return "";
}

function getFilterValues(filter) {
  if (Array.isArray(filter?.values)) {
    return filter.values.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof filter?.value === "string") {
    return filter.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeFilterMode(filter) {
  if (!filter || filter.mode === "none") return "none";
  if (filter.mode === "ignore_regex" || filter.match === "regex") return "ignore_regex";
  if (filter.mode === "ignore_not_contains") return "ignore_not_contains";
  if (filter.mode === "ignore_contains") return "ignore_contains";
  return "none";
}

function buildFilterFromControls(mode, values) {
  const normalizedValues = Array.from(new Set(
    (values || []).map((item) => String(item || "").trim()).filter(Boolean)
  ));
  if (mode === "none" || !normalizedValues.length) return null;
  return {
    mode,
    values: normalizedValues
  };
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
  return new Date(ts).toLocaleString(translator?.effective || normalizeUiLocaleTag(safeGetUiLanguage() || "en"));
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
    effective: normalizeUiLocaleTag(safeGetUiLanguage() || "en"),
    isRtl: false,
    t(key, vars = {}) {
      let template = safeGetMessage(key) || key;
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
