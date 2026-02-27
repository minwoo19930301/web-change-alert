(() => {
  if (window.__cmPickerActive) {
    const existing = document.getElementById("__cm_tooltip");
    if (existing) return;
  }
  window.__cmPickerActive = true;

  let currentTarget = null;
  let currentRequestId = null;
  let currentMode = "create";
  let currentMonitorId = null;
  let selecting = true;
  let currentPicked = null;
  let currentCandidates = [];
  let currentCandidateIndex = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  const localizer = globalThis.WebChangeLocalizer || null;
  let translator = {
    t(key, vars = {}) {
      let template = chrome.i18n.getMessage(key) || key;
      for (const [name, value] of Object.entries(vars)) {
        template = template.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
      }
      return template;
    },
    isRtl: false
  };

  function t(key, vars = {}) {
    return translator.t(key, vars);
  }

  const tooltip = document.createElement("div");
  tooltip.id = "__cm_tooltip";
  tooltip.innerHTML = "<div class='__cm_label'></div><div class='__cm_value'></div>";
  document.body.appendChild(tooltip);

  const highlightBox = document.createElement("div");
  highlightBox.id = "__cm_highlight";
  document.body.appendChild(highlightBox);

  const hint = document.createElement("div");
  hint.id = "__cm_hint";
  hint.textContent = t("hint");
  document.body.appendChild(hint);

  const overlay = document.createElement("div");
  overlay.id = "__cm_overlay";
  const modal = document.createElement("div");
  modal.id = "__cm_modal";
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const loadTranslator = async () => {
    if (localizer?.getSettingsLanguage && localizer?.createTranslator) {
      const preferred = await localizer.getSettingsLanguage();
      translator = await localizer.createTranslator(preferred || "auto");
    }
    hint.textContent = t("hint");
    const dir = translator?.isRtl ? "rtl" : "ltr";
    tooltip.dir = dir;
    hint.dir = dir;
    overlay.dir = dir;
  };

  loadTranslator().catch(() => {});

  const ensurePickerState = async () => {
    if (currentRequestId && (currentMode !== "update" || currentMonitorId)) {
      return;
    }
    const data = await chrome.storage.local.get(["activePicker"]);
    currentRequestId = data.activePicker?.requestId || currentRequestId;
    currentMode = data.activePicker?.mode || currentMode;
    currentMonitorId = data.activePicker?.monitorId || currentMonitorId;
  };

  chrome.storage.local.get(["activePicker"], (data) => {
    currentRequestId = data.activePicker?.requestId || null;
    currentMode = data.activePicker?.mode || "create";
    currentMonitorId = data.activePicker?.monitorId || null;
  });

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  const CLASS_BLACKLIST = new Set([
    "__cm_hover_target",
    "active",
    "hover",
    "selected",
    "open",
    "on",
    "off",
    "current",
    "is-active",
    "is-open"
  ]);

  function getFilteredClasses(element) {
    if (!element?.classList) return [];
    return Array.from(element.classList).filter((cls) => {
      if (!cls) return false;
      if (cls.startsWith("__cm_")) return false;
      if (CLASS_BLACKLIST.has(cls)) return false;
      return true;
    });
  }

  function isUniqueSelector(selector) {
    if (!selector) return false;
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function uniqueIdSelector(element) {
    if (!element?.id) return "";
    const idSelector = `#${cssEscape(element.id)}`;
    return isUniqueSelector(idSelector) ? idSelector : "";
  }

  function buildSegments(root, element, useClasses, useNth) {
    const segments = [];
    let node = element;
    while (node && node !== root && node.nodeType === 1) {
      let segment = node.tagName.toLowerCase();
      if (useClasses) {
        const classList = getFilteredClasses(node).slice(0, 2);
        if (classList.length) {
          segment += "." + classList.map(cssEscape).join(".");
        }
      }
      if (useNth && node.parentElement) {
        const siblings = Array.from(node.parentElement.children).filter(
          (child) => child.tagName === node.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(node) + 1;
          segment += `:nth-of-type(${index})`;
        }
      }
      segments.unshift(segment);
      node = node.parentElement;
    }
    return segments.join(" > ");
  }

  function getSelector(element) {
    if (!element || element.nodeType !== 1) return "";
    const directId = uniqueIdSelector(element);
    if (directId) return directId;

    let anchor = element.parentElement;
    while (anchor && anchor !== document.body) {
      const anchorId = uniqueIdSelector(anchor);
      if (anchorId) {
        const withClasses = `${anchorId} > ${buildSegments(anchor, element, true, false)}`;
        if (isUniqueSelector(withClasses)) return withClasses;
        const withNth = `${anchorId} > ${buildSegments(anchor, element, false, true)}`;
        if (isUniqueSelector(withNth)) return withNth;
        const withBoth = `${anchorId} > ${buildSegments(anchor, element, true, true)}`;
        if (isUniqueSelector(withBoth)) return withBoth;
        break;
      }
      anchor = anchor.parentElement;
    }

    const bodyRoot = document.body;
    const bodyWithClasses = `body > ${buildSegments(bodyRoot, element, true, false)}`;
    if (isUniqueSelector(bodyWithClasses)) return bodyWithClasses;

    const bodyWithBoth = `body > ${buildSegments(bodyRoot, element, true, true)}`;
    if (isUniqueSelector(bodyWithBoth)) return bodyWithBoth;

    const bodyWithNth = `body > ${buildSegments(bodyRoot, element, false, true)}`;
    if (isUniqueSelector(bodyWithNth)) return bodyWithNth;

    return buildSegments(bodyRoot, element, false, true);
  }

  function getImageSource(element) {
    if (!element) return "";
    if (element.tagName === "IMG") {
      return (
        element.currentSrc ||
        element.src ||
        element.getAttribute("src") ||
        element.getAttribute("data-src") ||
        element.getAttribute("data-lazy-src") ||
        ""
      );
    }
    if (element.tagName === "PICTURE") {
      const directImg = element.querySelector("img");
      if (directImg) {
        const imgSrc =
          directImg.currentSrc ||
          directImg.src ||
          directImg.getAttribute("src") ||
          directImg.getAttribute("data-src") ||
          directImg.getAttribute("data-lazy-src") ||
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
    return "";
  }

  function getSvgSource(element) {
    if (!element || element.tagName !== "SVG") return "";
    try {
      const svgText = new XMLSerializer().serializeToString(element);
      if (!svgText) return "";
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    } catch {
      return "";
    }
  }

  function getCanvasSource(element) {
    if (!element || element.tagName !== "CANVAS") return "";
    try {
      return element.toDataURL("image/png");
    } catch {
      return "";
    }
  }

  function getBackgroundImageSource(element) {
    if (!element) return "";
    const bgImage = window.getComputedStyle(element).backgroundImage || "";
    const bgMatch = bgImage.match(/url\((['"]?)(.*?)\1\)/i);
    return bgMatch && bgMatch[2] ? bgMatch[2] : "";
  }

  function getImageLikeSource(element) {
    return getImageSource(element) || getSvgSource(element) || getCanvasSource(element) || getBackgroundImageSource(element);
  }

  function parsePseudoContent(content) {
    const value = String(content || "");
    if (!value || value === "none" || value === "normal") return "";
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
      return value.slice(1, -1).replace(/\\A/g, " ");
    }
    return value.replace(/\\A/g, " ");
  }

  function getPseudoText(element) {
    if (!element) return "";
    const before = parsePseudoContent(window.getComputedStyle(element, "::before").content);
    const after = parsePseudoContent(window.getComputedStyle(element, "::after").content);
    return sanitize(`${before} ${after}`);
  }

  function getOwnText(element) {
    if (!element) return "";
    let joined = "";
    for (const node of Array.from(element.childNodes || [])) {
      if (node.nodeType === Node.TEXT_NODE) {
        joined += ` ${node.textContent || ""}`;
      }
    }
    return sanitize(joined);
  }

  function getShadowRootText(element) {
    if (!element?.shadowRoot) return "";
    return sanitize(element.shadowRoot.textContent || "");
  }

  function buildDisplayStyle(element) {
    if (!element) return null;
    const style = window.getComputedStyle(element);
    const snapshot = {
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      fontFamily: style.fontFamily,
      letterSpacing: style.letterSpacing,
      textDecoration: style.textDecorationLine,
      textTransform: style.textTransform,
      lineHeight: style.lineHeight
    };

    if (
      style.backgroundColor &&
      style.backgroundColor !== "transparent" &&
      style.backgroundColor !== "rgba(0, 0, 0, 0)"
    ) {
      snapshot.backgroundColor = style.backgroundColor;
    }
    return snapshot;
  }

  function shouldKeepDisplayStyle(element, data) {
    if (!element || !data || data.type !== "text") return false;
    const inner = sanitize(element.innerText || "");
    if (inner) return false;
    return true;
  }

  function getPreferredValue(element) {
    if (!element) return { type: "text", value: "" };

    const directImageLike = getImageLikeSource(element);
    if (directImageLike) {
      return { type: "image", value: directImageLike };
    }

    if (element.shadowRoot) {
      const shadowMedia = element.shadowRoot.querySelector("img, picture, svg, canvas");
      if (shadowMedia) {
        const shadowSource = getImageLikeSource(shadowMedia);
        if (shadowSource) return { type: "image", value: shadowSource };
      }
    }

    const ownText = getOwnText(element);
    if (ownText) return { type: "text", value: ownText };

    const text = sanitize(element.innerText || "");
    if (text) {
      const tooBroadContainer = element.childElementCount >= 6 && text.length >= 120;
      if (!tooBroadContainer) {
        return { type: "text", value: text };
      }
    }

    const shadowText = getShadowRootText(element);
    if (shadowText) return { type: "text", value: shadowText };

    const pseudoText = getPseudoText(element);
    if (pseudoText) return { type: "text", value: pseudoText };

    const valueProp = element.value ?? element.getAttribute("value");
    if (valueProp != null && String(valueProp).trim()) {
      return { type: "value", value: String(valueProp).trim() };
    }

    const attrs = ["content", "aria-label", "title", "alt", "data-value", "data-text", "data-title"];
    for (const attr of attrs) {
      const attrValue = element.getAttribute(attr);
      if (attrValue && String(attrValue).trim()) {
        return { type: "attr", attr, value: String(attrValue).trim() };
      }
    }

    if (element.dataset) {
      for (const [key, val] of Object.entries(element.dataset)) {
        if (val && String(val).trim()) {
          return {
            type: "attr",
            attr: `data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`,
            value: String(val).trim()
          };
        }
      }
    }

    return { type: "text", value: "" };
  }

  function isPickerUiNode(element) {
    if (!element) return true;
    const id = element.id || "";
    if (id.startsWith("__cm_")) return true;
    if (element.closest("#__cm_tooltip")) return true;
    if (element.closest("#__cm_hint")) return true;
    if (element.closest("#__cm_overlay")) return true;
    return false;
  }

  function getHitStack(clientX, clientY) {
    const stack = [];
    const seen = new Set();
    const disabled = [];

    try {
      for (let depth = 0; depth < 16; depth += 1) {
        const element = document.elementFromPoint(clientX, clientY);
        if (!element || element.nodeType !== 1 || isPickerUiNode(element) || seen.has(element)) {
          break;
        }
        stack.push(element);
        seen.add(element);

        disabled.push({
          element,
          value: element.style.getPropertyValue("pointer-events"),
          priority: element.style.getPropertyPriority("pointer-events")
        });
        element.style.setProperty("pointer-events", "none", "important");
      }
    } finally {
      for (let index = disabled.length - 1; index >= 0; index -= 1) {
        const item = disabled[index];
        if (item.value) {
          item.element.style.setProperty("pointer-events", item.value, item.priority);
        } else {
          item.element.style.removeProperty("pointer-events");
        }
      }
    }

    if (typeof document.elementsFromPoint === "function") {
      const fallbackStack = document.elementsFromPoint(clientX, clientY);
      for (const element of fallbackStack) {
        if (!element || element.nodeType !== 1 || isPickerUiNode(element) || seen.has(element)) continue;
        stack.push(element);
        seen.add(element);
      }
    }

    return stack;
  }

  function looksLikeUtilityText(value) {
    const text = sanitize(value).toLowerCase();
    if (!text) return true;
    const patterns = [
      "상세페이지 바로가기",
      "바로가기",
      "찜하기",
      "자세히 보기",
      "더보기",
      "click",
      "open",
      "link"
    ];
    return patterns.some((pattern) => text.includes(pattern));
  }

  function scoreCandidate(element, data, depth) {
    const rect = element.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const tag = (element.tagName || "").toUpperCase();
    const textLength = sanitize(data?.value || "").length;
    const isMediaTag = tag === "IMG" || tag === "SVG" || tag === "CANVAS" || tag === "PICTURE";

    let score = area / 10 + depth * 6;

    if (area > viewportArea * 0.75) score += 90000;
    else if (area > viewportArea * 0.35) score += 16000;

    if (["HTML", "BODY", "MAIN", "SECTION", "ARTICLE", "UL", "OL", "LI", "DIV"].includes(tag)) {
      score += 3000;
    }

    if (textLength > 180) score += 5000;
    if (textLength > 350) score += 12000;

    if (data?.type === "image") {
      if (isMediaTag) {
        score -= area >= 2500 ? 12000 : 600;
        if (tag === "SVG" && area < 1600) score += 7000;
      } else {
        score += 7000;
      }
    } else if (textLength >= 4 && textLength <= 120) {
      score -= 1800;
    } else if (textLength <= 2) {
      score += 2200;
    }

    if ((tag === "A" || tag === "BUTTON") && looksLikeUtilityText(data?.value || "")) {
      score += 7000;
    }

    return score;
  }

  function getLooseValue(element) {
    const preferred = getPreferredValue(element);
    if (sanitize(preferred?.value || "")) return preferred;

    const imageLike = getImageLikeSource(element);
    if (imageLike) return { type: "image", value: imageLike };

    const shadowText = getShadowRootText(element);
    if (shadowText) return { type: "text", value: shadowText };

    const fallbackText = sanitize(
      element.innerText ||
      element.textContent ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.tagName.toLowerCase()
    );
    return { type: "text", value: fallbackText || element.tagName.toLowerCase() };
  }

  function pickElementAtPoint(clientX, clientY) {
    const stack = getHitStack(clientX, clientY);
    const candidates = [];

    for (let index = 0; index < stack.length; index += 1) {
      const element = stack[index];
      const rect = element.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;

      const data = getPreferredValue(element);
      const normalizedValue = sanitize(data?.value || "");
      if (!normalizedValue) continue;

      candidates.push({
        element,
        data,
        score: scoreCandidate(element, data, index)
      });
    }

    if (!candidates.length) {
      if (!stack.length) return null;
      for (let index = 0; index < stack.length; index += 1) {
        const element = stack[index];
        const data = getLooseValue(element);
        candidates.push({
          element,
          data,
          score: scoreCandidate(element, data, index)
        });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score);
    return { ...candidates[0], candidates };
  }

  function sanitize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function updateHighlight(target) {
    if (currentTarget && currentTarget !== target) {
      currentTarget.classList.remove("__cm_hover_target");
    }
    currentTarget = target;
    if (currentTarget) {
      currentTarget.classList.add("__cm_hover_target");
      const rect = currentTarget.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        highlightBox.style.display = "block";
        highlightBox.style.left = `${Math.round(rect.left)}px`;
        highlightBox.style.top = `${Math.round(rect.top)}px`;
        highlightBox.style.width = `${Math.round(rect.width)}px`;
        highlightBox.style.height = `${Math.round(rect.height)}px`;
      } else {
        highlightBox.style.display = "none";
      }
    } else {
      highlightBox.style.display = "none";
    }
  }

  function updateTooltip(event, data) {
    const label = tooltip.querySelector(".__cm_label");
    const value = tooltip.querySelector(".__cm_value");
    if (!data) {
      tooltip.style.display = "none";
      return;
    }
    tooltip.style.display = "block";
    if (data.type === "attr") {
      label.textContent = `${t("typeAttr")}: ${data.attr}`;
    } else {
      const typeLabel = data.type === "image" ? t("typeImage") : data.type === "value" ? t("typeValue") : t("typeText");
      label.textContent = typeLabel;
    }
    value.textContent = data.value ? truncate(data.value, 140) : t("noValue");

    const offset = 12;
    let left = event.clientX + offset;
    let top = event.clientY + offset;
    if (left + tooltip.offsetWidth > window.innerWidth) {
      left = event.clientX - tooltip.offsetWidth - offset;
    }
    if (top + tooltip.offsetHeight > window.innerHeight) {
      top = event.clientY - tooltip.offsetHeight - offset;
    }
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function truncate(value, max) {
    return value.length > max ? value.slice(0, max - 1) + "…" : value;
  }

  function enterSelectMode() {
    selecting = true;
    currentPicked = null;
    currentCandidates = [];
    currentCandidateIndex = 0;
    tooltip.style.display = "none";
    hint.style.display = "block";
    highlightBox.style.display = "none";
  }

  function exitSelectMode() {
    selecting = false;
    currentPicked = null;
    currentCandidates = [];
    currentCandidateIndex = 0;
    tooltip.style.display = "none";
    hint.style.display = "none";
    highlightBox.style.display = "none";
    if (currentTarget) {
      currentTarget.classList.remove("__cm_hover_target");
      currentTarget = null;
    }
  }

  function showOverlay() {
    overlay.style.display = "block";
  }

  function hideOverlay() {
    overlay.style.display = "none";
  }

  function renderConfirm(selection) {
    showOverlay();
    const isImage = selection?.extract?.type === "image" && selection?.value;
    const valueBlock = isImage
      ? `<img class="__cm_preview" src="${escapeHtml(selection.value)}" alt="preview" />`
      : `${escapeHtml(selection.value || t("noValue"))}`;
    modal.innerHTML = `
      <div class="__cm_title">${t("confirmTitle")}</div>
      <div class="__cm_block">
        <div class="__cm_label">${t("valueLabel")}</div>
        <div class="__cm_value">${valueBlock}</div>
      </div>
      <div class="__cm_question">${t("confirmQuestion")}</div>
      <div class="__cm_actions">
        <button class="__cm_btn __cm_btn_secondary" id="__cm_reselect">${t("reselect")}</button>
        <button class="__cm_btn __cm_btn_primary" id="__cm_confirm">${t("confirm")}</button>
      </div>
      <div class="__cm_status" id="__cm_status"></div>
    `;

    const reselectBtn = modal.querySelector("#__cm_reselect");
    const confirmBtn = modal.querySelector("#__cm_confirm");

    reselectBtn.addEventListener("click", () => {
      hideOverlay();
      enterSelectMode();
    });

    confirmBtn.addEventListener("click", () => {
      renderSchedule(selection);
    });
  }

  function renderSchedule(selection) {
    const isUpdate = currentMode === "update" && currentMonitorId;
    showOverlay();
    const isImage = selection?.extract?.type === "image" && selection?.value;
    const valueBlock = isImage
      ? `<img class="__cm_preview" src="${escapeHtml(selection.value)}" alt="preview" />`
      : `${escapeHtml(selection.value || t("noValue"))}`;
    modal.innerHTML = `
      <div class="__cm_title">${isUpdate ? t("updateTitle") : t("createTitle")}</div>
      <div class="__cm_block">
        <div class="__cm_label">${t("selectedValue")}</div>
        <div class="__cm_value">${valueBlock}</div>
      </div>
      <div class="__cm_block ${isUpdate ? "__cm_hidden" : ""}" id="__cm_scheduleSection">
        <div class="__cm_label">${t("scheduleLabel")}</div>
        <div class="__cm_row" id="__cm_scheduleRow">
          <select id="__cm_scheduleType" class="__cm_select">
            <option value="interval">${t("scheduleInterval")}</option>
            <option value="daily">${t("scheduleDaily")}</option>
            <option value="weekly">${t("scheduleWeekly")}</option>
            <option value="monthly">${t("scheduleMonthly")}</option>
          </select>
          <input id="__cm_intervalValue" class="__cm_input" type="number" min="1" value="10" />
          <select id="__cm_intervalUnit" class="__cm_select">
            <option value="minutes">${t("minute")}</option>
            <option value="hours">${t("hour")}</option>
            <option value="days">${t("day")}</option>
          </select>
        </div>
        <div id="__cm_dailyFields" class="__cm_hidden" style="margin-top:8px;">
          <input id="__cm_dailyTime" class="__cm_input" type="time" value="09:00" />
        </div>
        <div id="__cm_weeklyFields" class="__cm_hidden" style="margin-top:8px;">
          <div class="__cm_row __cm_row_two">
            <select id="__cm_weeklyDay" class="__cm_select">
              <option value="0">${t("weekday0")}</option>
              <option value="1">${t("weekday1")}</option>
              <option value="2">${t("weekday2")}</option>
              <option value="3">${t("weekday3")}</option>
              <option value="4">${t("weekday4")}</option>
              <option value="5">${t("weekday5")}</option>
              <option value="6">${t("weekday6")}</option>
            </select>
            <input id="__cm_weeklyTime" class="__cm_input" type="time" value="09:00" />
          </div>
        </div>
        <div id="__cm_monthlyFields" class="__cm_hidden" style="margin-top:8px;">
          <div class="__cm_row __cm_row_two">
            <input id="__cm_monthlyDay" class="__cm_input" type="number" min="1" max="28" value="1" />
            <input id="__cm_monthlyTime" class="__cm_input" type="time" value="09:00" />
          </div>
        </div>
      </div>
      <button class="__cm_btn __cm_btn_primary __cm_btn_full" id="__cm_register">${t("register")}</button>
      <div class="__cm_status" id="__cm_status"></div>
    `;

    const scheduleType = modal.querySelector("#__cm_scheduleType");
    const scheduleRow = modal.querySelector("#__cm_scheduleRow");
    const dailyFields = modal.querySelector("#__cm_dailyFields");
    const weeklyFields = modal.querySelector("#__cm_weeklyFields");
    const monthlyFields = modal.querySelector("#__cm_monthlyFields");
    const intervalInput = modal.querySelector("#__cm_intervalValue");
    const weeklyTime = modal.querySelector("#__cm_weeklyTime");
    const monthlyTime = modal.querySelector("#__cm_monthlyTime");
    const dailyTime = modal.querySelector("#__cm_dailyTime");
    const registerBtn = modal.querySelector("#__cm_register");
    const statusEl = modal.querySelector("#__cm_status");

    function updateScheduleFields() {
      scheduleRow.classList.toggle("single", scheduleType.value !== "interval");
      dailyFields.classList.toggle("__cm_hidden", scheduleType.value !== "daily");
      weeklyFields.classList.toggle("__cm_hidden", scheduleType.value !== "weekly");
      monthlyFields.classList.toggle("__cm_hidden", scheduleType.value !== "monthly");
    }

    if (!isUpdate) {
      scheduleType.addEventListener("change", updateScheduleFields);
      updateScheduleFields();
    }

    intervalInput.addEventListener("wheel", (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 1 : -1;
      const current = Number(intervalInput.value || 1);
      const next = Math.max(1, current + delta);
      intervalInput.value = String(next);
    }, { passive: false });

    const createTimePanel = (input) => {
      if (!input) return null;
      const panel = document.createElement("div");
      panel.className = "__cm_time_panel __cm_hidden";

      const hourSelect = document.createElement("select");
      hourSelect.className = "__cm_select";
      for (let h = 0; h < 24; h += 1) {
        const opt = document.createElement("option");
        opt.value = String(h).padStart(2, "0");
        opt.textContent = String(h).padStart(2, "0");
        hourSelect.appendChild(opt);
      }

      const minuteSelect = document.createElement("select");
      minuteSelect.className = "__cm_select";
      for (let m = 0; m < 60; m += 1) {
        const opt = document.createElement("option");
        opt.value = String(m).padStart(2, "0");
        opt.textContent = String(m).padStart(2, "0");
        minuteSelect.appendChild(opt);
      }

      panel.appendChild(hourSelect);
      panel.appendChild(minuteSelect);
      input.insertAdjacentElement("afterend", panel);

      const syncFromInput = () => {
        const [h, m] = String(input.value || "09:00").split(":");
        hourSelect.value = String(h || "09").padStart(2, "0");
        minuteSelect.value = String(m || "00").padStart(2, "0");
      };

      const syncToInput = () => {
        input.value = `${hourSelect.value}:${minuteSelect.value}`;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };

      hourSelect.addEventListener("change", syncToInput);
      minuteSelect.addEventListener("change", syncToInput);

      return {
        panel,
        open: () => {
          syncFromInput();
          panel.classList.remove("__cm_hidden");
        },
        close: () => {
          panel.classList.add("__cm_hidden");
        }
      };
    };

    const bindTimePicker = (input) => {
      if (!input) return;
      const timePanel = createTimePanel(input);
      const openPicker = (event) => {
        event.stopPropagation();
        try {
          input.focus({ preventScroll: true });
        } catch {}
        let openedNative = false;
        if (typeof input.showPicker === "function") {
          try {
            input.showPicker();
            openedNative = true;
          } catch {}
        }
        if (!openedNative) {
          timePanel?.open();
        } else if (timePanel) {
          setTimeout(() => {
            if (document.activeElement === input && timePanel.panel.classList.contains("__cm_hidden")) {
              timePanel.open();
            }
          }, 120);
        }
      };
      input.addEventListener("pointerdown", openPicker);
      input.addEventListener("click", openPicker);
      input.addEventListener("focus", openPicker);

      overlay.addEventListener("pointerdown", (event) => {
        if (!timePanel) return;
        if (event.target === input || timePanel.panel.contains(event.target)) return;
        timePanel.close();
      });
    };

    [dailyTime, weeklyTime, monthlyTime].forEach(bindTimePicker);

    registerBtn.addEventListener("click", async () => {
      statusEl.textContent = t("registering");
      await ensurePickerState();
      let response;
      if (isUpdate) {
        const updates = buildUpdate(selection);
        response = await sendMessage({ type: "updateMonitorFields", id: currentMonitorId, updates });
      } else {
        const schedule = buildSchedule(modal);
        const monitor = buildMonitor(selection, schedule);
        response = await sendMessage({ type: "saveMonitor", monitor });
      }
      if (!response?.ok) {
        statusEl.textContent = `${t("registerFailed")}: ${response?.error || ""}`;
        return;
      }

      await sendMessage({ type: "pickerComplete", requestId: currentRequestId });
      statusEl.textContent = t("registerDone");
      setTimeout(() => cleanup(), 400);
    });
  }

  function buildSchedule(modalRoot) {
    const enabled = true;
    const type = modalRoot.querySelector("#__cm_scheduleType")?.value || "interval";

    if (type === "interval") {
      const value = Math.max(1, Number(modalRoot.querySelector("#__cm_intervalValue")?.value || 1));
      const unit = modalRoot.querySelector("#__cm_intervalUnit")?.value || "minutes";
      const minutes = unit === "hours" ? value * 60 : unit === "days" ? value * 1440 : value;
      return { enabled, type, minutes };
    }

    if (type === "daily") {
      const [hour, minute] = parseTime(modalRoot.querySelector("#__cm_dailyTime")?.value);
      return { enabled, type, hour, minute };
    }

    if (type === "weekly") {
      const [hour, minute] = parseTime(modalRoot.querySelector("#__cm_weeklyTime")?.value);
      const weekday = Number(modalRoot.querySelector("#__cm_weeklyDay")?.value || 0);
      return { enabled, type, weekday, hour, minute };
    }

    if (type === "monthly") {
      const [hour, minute] = parseTime(modalRoot.querySelector("#__cm_monthlyTime")?.value);
      const day = Math.min(28, Math.max(1, Number(modalRoot.querySelector("#__cm_monthlyDay")?.value || 1)));
      return { enabled, type, day, hour, minute };
    }

    return { enabled: false, type: "interval", minutes: 10 };
  }

  function parseTime(value) {
    const parts = String(value || "09:00").split(":");
    const hour = Number(parts[0] || 0);
    const minute = Number(parts[1] || 0);
    return [hour, minute];
  }

  function buildMonitor(selection, schedule) {
    const url = selection.url || location.href;
    const title = document.title || buildTitleFromUrl(url);
    return {
      id: buildRequestId(),
      url,
      title,
      selector: selection.selector,
      extract: selection.extract,
      displayStyle: selection.displayStyle || null,
      lastValue: selection.value || "",
      previousValue: "",
      previousChangedAt: null,
      lastChangedAt: Date.now(),
      lastCheckedAt: null,
      createdAt: Date.now(),
      schedule
    };
  }

  function buildUpdate(selection) {
    const url = selection.url || location.href;
    const title = document.title || buildTitleFromUrl(url);
    return {
      url,
      title,
      selector: selection.selector,
      extract: selection.extract,
      displayStyle: selection.displayStyle || null,
      lastValue: selection.value || "",
      lastChangedAt: Date.now(),
      lastCheckedAt: null,
      previousValue: "",
      previousChangedAt: null,
      previousCheckedValue: "",
      previousCheckedAt: null,
      lastError: null,
      lastDebug: null
    };
  }

  function buildTitleFromUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }

  function buildRequestId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }

  function onMouseMove(event) {
    if (!selecting) return;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    const picked = pickElementAtPoint(event.clientX, event.clientY);
    if (!picked?.element) {
      currentPicked = null;
      currentCandidates = [];
      currentCandidateIndex = 0;
      updateHighlight(null);
      updateTooltip(event, null);
      return;
    }
    currentCandidates = picked.candidates || [picked];
    currentCandidateIndex = 0;
    currentPicked = currentCandidates[0];
    updateHighlight(currentPicked.element);
    updateTooltip(event, currentPicked.data);
  }

  function onWheel(event) {
    if (!selecting || currentCandidates.length <= 1) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY > 0 ? 1 : -1;
    currentCandidateIndex =
      (currentCandidateIndex + direction + currentCandidates.length) % currentCandidates.length;
    currentPicked = currentCandidates[currentCandidateIndex];
    updateHighlight(currentPicked.element);
    updateTooltip({ clientX: lastPointerX, clientY: lastPointerY }, currentPicked.data);
  }

  async function onClick(event) {
    if (!selecting) return;
    event.preventDefault();
    event.stopPropagation();

    const picked = currentPicked?.element?.isConnected
      ? currentPicked
      : pickElementAtPoint(event.clientX, event.clientY);
    const targetElement = picked?.element || currentTarget;
    if (!targetElement) return;
    await ensurePickerState();
    const selector = getSelector(targetElement);
    const data = picked?.data || getPreferredValue(targetElement);
    const selection = {
      selector,
      url: location.href,
      title: document.title || "",
      value: data.value,
      extract: data.type === "attr" ? { type: data.type, attr: data.attr } : { type: data.type },
      displayStyle: shouldKeepDisplayStyle(targetElement, data)
        ? { ...buildDisplayStyle(targetElement), __noInnerText: true }
        : null
    };

    exitSelectMode();
    renderConfirm(selection);
  }

  async function onKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    await ensurePickerState();
    cancelPicker();
  }

  function cancelPicker() {
    sendMessage({ type: "pickerCancelled", requestId: currentRequestId }).finally(() => {
      cleanup();
    });
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("wheel", onWheel, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    if (currentTarget) {
      currentTarget.classList.remove("__cm_hover_target");
    }
    highlightBox.remove();
    tooltip.remove();
    hint.remove();
    overlay.remove();
    window.__cmPickerActive = false;
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  enterSelectMode();
})();
