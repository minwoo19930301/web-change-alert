(() => {
  if (window.__cmPickerActive) {
    try {
      window.__cmPickerCleanup?.();
    } catch {}
    for (const selector of ["#__cm_tooltip", "#__cm_highlight", "#__cm_hint", "#__cm_candidate_menu", "#__cm_overlay"]) {
      document.querySelector(selector)?.remove();
    }
  }
  if (!hasExtensionContext()) return;
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
  let pickFrameRequested = false;
  let pendingPointerEvent = null;
  let candidateMenuOpen = false;
  const localizer = globalThis.WebChangeLocalizer || null;
  let translator = {
    t(key, vars = {}) {
      const template = safeGetMessage(key) || key;
      return formatTemplate(template, vars);
    },
    isRtl: false
  };

  function t(key, vars = {}) {
    try {
      const value = translator?.t?.(key, vars) || safeGetMessage(key);
      return value ? formatTemplate(value, vars) : key;
    } catch {
      return safeGetMessage(key) || key;
    }
  }

  function formatTemplate(template, vars = {}) {
    let output = String(template || "");
    for (const [name, value] of Object.entries(vars)) {
      output = output.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
    return output;
  }

  function safeGetMessage(key) {
    try {
      return globalThis.chrome?.i18n?.getMessage?.(key) || "";
    } catch {
      return "";
    }
  }

  function hasExtensionContext() {
    try {
      return Boolean(globalThis.chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function abortIfContextLost() {
    if (hasExtensionContext()) return false;
    cleanup();
    return true;
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

  const candidateMenu = document.createElement("div");
  candidateMenu.id = "__cm_candidate_menu";
  document.body.appendChild(candidateMenu);

  const overlay = document.createElement("div");
  overlay.id = "__cm_overlay";
  const modal = document.createElement("div");
  modal.id = "__cm_modal";
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const isolatedEvents = [
    "beforeinput",
    "input",
    "keydown",
    "keyup",
    "keypress",
    "compositionstart",
    "compositionupdate",
    "compositionend",
    "pointerdown",
    "pointerup",
    "click",
    "wheel"
  ];
  for (const eventName of isolatedEvents) {
    modal.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
    candidateMenu.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
  }

  const loadTranslator = async () => {
    if (localizer?.getSettingsLanguage && localizer?.createTranslator) {
      const preferred = await localizer.getSettingsLanguage();
      translator = await localizer.createTranslator(preferred || "auto");
    }
    hint.textContent = t("hint");
    const dir = translator?.isRtl ? "rtl" : "ltr";
    tooltip.dir = dir;
    hint.dir = dir;
    candidateMenu.dir = dir;
    overlay.dir = dir;
  };

  loadTranslator().catch(() => {});

  const ensurePickerState = async () => {
    if (currentRequestId && (currentMode !== "update" || currentMonitorId)) {
      return;
    }
    const data = await storageGet(["activePicker"]);
    currentRequestId = data.activePicker?.requestId || currentRequestId;
    currentMode = data.activePicker?.mode || currentMode;
    currentMonitorId = data.activePicker?.monitorId || currentMonitorId;
  };

  storageGet(["activePicker"]).then((data) => {
    currentRequestId = data.activePicker?.requestId || null;
    currentMode = data.activePicker?.mode || "create";
    currentMonitorId = data.activePicker?.monitorId || null;
  });

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        if (!globalThis.chrome?.storage?.local?.get) {
          resolve({});
          return;
        }
        chrome.storage.local.get(keys, (data) => {
          if (globalThis.chrome?.runtime?.lastError) {
            resolve({});
            return;
          }
          resolve(data || {});
        });
      } catch {
        resolve({});
      }
    });
  }

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

    if (isInlineTextElement(element)) {
      const inlineText = getCompactElementText(element);
      if (inlineText) return { type: "text", value: inlineText };
    }

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

    const ownText = withPickerUiHidden(() => getOwnText(element));
    if (ownText) return { type: "text", value: ownText };

    const text = withPickerUiHidden(() => sanitize(element.innerText || ""));
    if (text) {
      const tooBroadContainer = element.childElementCount >= 6 && text.length >= 120;
      if (!tooBroadContainer) {
        return { type: "text", value: text };
      }
    }

    const shadowText = withPickerUiHidden(() => getShadowRootText(element));
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

  function getCandidateValues(element) {
    const values = [];
    const preferred = getPreferredValue(element);
    if (sanitize(preferred?.value || "")) values.push(preferred);

    const ownText = withPickerUiHidden(() => getOwnText(element));
    if (ownText && !values.some((item) => item.type === "ownText" && item.value === ownText)) {
      values.push({ type: "ownText", value: ownText });
    }

    for (const tokenValue of getTextTokenValues(element)) {
      if (!values.some((item) => item.type === "textToken" && item.value === tokenValue.value && item.index === tokenValue.index)) {
        values.push(tokenValue);
      }
    }

    return values.filter((item, index, items) => {
      const key = `${item.type}:${item.attr || ""}:${item.index ?? ""}:${item.value}`;
      return items.findIndex((other) => `${other.type}:${other.attr || ""}:${other.index ?? ""}:${other.value}` === key) === index;
    });
  }

  function getTextTokenValues(element) {
    const text = withPickerUiHidden(() => sanitize(element.innerText || element.textContent || ""));
    if (!text || text.length > 120) return [];
    const tokens = text.match(/[0-9]{1,2}|[0-9]{1,3}(?:,[0-9]{3})+|[A-Za-z]+|[가-힣]+/g) || [];
    if (tokens.length < 2 || tokens.length > 12) return [];
    return tokens.map((value, index) => ({ type: "textToken", value, index }));
  }

  function isInlineTextElement(element) {
    const tag = (element?.tagName || "").toUpperCase();
    return ["SPAN", "DEL", "INS", "STRONG", "EM", "B", "I", "SMALL", "MARK", "TIME"].includes(tag);
  }

  function getCompactElementText(element) {
    return withPickerUiHidden(() => {
      const text = sanitize(element.innerText || element.textContent || "");
      if (!text || text.length > 160) return "";
      if (element.childElementCount > 4) return "";
      return text;
    });
  }

  function isPickerUiNode(element) {
    if (!element) return true;
    const id = element.id || "";
    if (id.startsWith("__cm_")) return true;
    if (element.closest("#__cm_tooltip")) return true;
    if (element.closest("#__cm_hint")) return true;
    if (element.closest("#__cm_candidate_menu")) return true;
    if (element.closest("#__cm_overlay")) return true;
    return false;
  }

  function getHitStack(clientX, clientY) {
    const stack = [];
    const seen = new Set();
    const disabled = [];
    const addElement = (element) => {
      if (!element || element.nodeType !== 1 || isPickerUiNode(element) || seen.has(element)) return false;
      stack.push(element);
      seen.add(element);
      return true;
    };

    try {
      for (let depth = 0; depth < 8; depth += 1) {
        const element = document.elementFromPoint(clientX, clientY);
        if (!element || element.nodeType !== 1 || isPickerUiNode(element) || seen.has(element)) {
          break;
        }
        addElement(element);

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
        addElement(element);
      }
    }

    return stack;
  }

  function getCaretTextHitAtPoint(clientX, clientY) {
    let node = null;
    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(clientX, clientY);
      node = position?.offsetNode || null;
    } else if (typeof document.caretRangeFromPoint === "function") {
      const range = document.caretRangeFromPoint(clientX, clientY);
      node = range?.startContainer || null;
    }
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE && !sanitize(node.textContent || "")) return null;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element || isPickerUiNode(element)) return null;
    const rect = element.getBoundingClientRect();
    if (
      !rect ||
      clientX < rect.left - 2 ||
      clientX > rect.right + 2 ||
      clientY < rect.top - 2 ||
      clientY > rect.bottom + 2
    ) {
      return null;
    }
    return {
      element,
      preferOwnText: node.nodeType === Node.TEXT_NODE && sanitize(node.textContent || "").length <= 80
    };
  }

  function isTooBroadCandidate(element, data) {
    const tag = (element?.tagName || "").toUpperCase();
    if (tag === "HTML" || tag === "BODY") return true;
    const rect = element.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const textLength = sanitize(data?.value || "").length;
    return area > viewportArea * 0.72 || (["MAIN", "SECTION", "ARTICLE"].includes(tag) && textLength > 220);
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

    let score = area / 10 + depth * 10;

    if (area > viewportArea * 0.75) score += 90000;
    else if (area > viewportArea * 0.35) score += 16000;

    if (["HTML", "BODY", "MAIN", "SECTION", "ARTICLE", "UL", "OL", "LI", "DIV"].includes(tag)) {
      score += 3000;
    }
    if (["SPAN", "DEL", "INS", "STRONG", "EM", "B", "I", "SMALL", "MARK"].includes(tag)) {
      score -= 2200;
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

    const fallbackText = withPickerUiHidden(() => sanitize(
      element.innerText ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.tagName.toLowerCase()
    ));
    return { type: "text", value: fallbackText || element.tagName.toLowerCase() };
  }

  function withPickerUiHidden(fn) {
    const nodes = [tooltip, hint, candidateMenu, overlay, highlightBox].filter(Boolean);
    const previous = nodes.map((node) => ({
      node,
      display: node.style.display
    }));
    for (const node of nodes) {
      node.style.display = "none";
    }
    try {
      return fn();
    } finally {
      for (const item of previous) {
        item.node.style.display = item.display;
      }
    }
  }

  function pickElementAtPoint(clientX, clientY) {
    const hitStack = getHitStack(clientX, clientY);
    const candidates = [];
    const directTextHit = getCaretTextHitAtPoint(clientX, clientY);
    const directTextElement = directTextHit?.element || null;
    const anchorElement = directTextElement || hitStack[0] || null;
    const stack = buildScopedCandidateElements(anchorElement, hitStack);
    let directCandidate = null;

    if (directTextElement) {
      const rect = directTextElement.getBoundingClientRect();
      const directValues = getCandidateValues(directTextElement);
      if (directTextHit?.preferOwnText) {
        directValues.sort((a, b) => (a.type === "ownText" ? -1 : 0) - (b.type === "ownText" ? -1 : 0));
      }
      for (const data of directValues) {
        const normalizedValue = sanitize(data?.value || "");
        if (rect?.width > 0 && rect?.height > 0 && normalizedValue && !isTooBroadCandidate(directTextElement, data)) {
          const candidate = {
            element: directTextElement,
            data,
            score: scoreCandidate(directTextElement, data, -1) - (data.type === "ownText" ? 9000 : 10000)
          };
          if (!directCandidate) directCandidate = candidate;
          candidates.push(candidate);
        }
      }
    }

    for (let index = 0; index < stack.length; index += 1) {
      const element = stack[index];
      if (element === directTextElement) continue;
      const rect = element.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;

      for (const data of getCandidateValues(element)) {
        const normalizedValue = sanitize(data?.value || "");
        if (!normalizedValue) continue;
        if (isTooBroadCandidate(element, data)) continue;

        const candidate = {
          element,
          data,
          score: scoreCandidate(element, data, index)
        };
        candidates.push(candidate);
        if (!directCandidate && element === anchorElement) {
          directCandidate = candidate;
        }
      }
    }

    if (!candidates.length) {
      if (!stack.length) return null;
      for (let index = 0; index < stack.length; index += 1) {
        const element = stack[index];
        const data = getLooseValue(element);
        if (isTooBroadCandidate(element, data)) continue;
        candidates.push({
          element,
          data,
          score: scoreCandidate(element, data, index)
        });
      }
    }

    if (!candidates.length) return null;
    const uniqueCandidates = [];
    const seenCandidates = new Set();
    for (const candidate of candidates) {
      const key = `${getSelector(candidate.element)}|${candidate.data.type}|${candidate.data.attr || ""}|${candidate.data.value}`;
      if (seenCandidates.has(key)) continue;
      seenCandidates.add(key);
      uniqueCandidates.push(candidate);
    }
    if (!uniqueCandidates.length) return null;
    uniqueCandidates.sort((a, b) => a.score - b.score);
    const picked = directCandidate && uniqueCandidates.includes(directCandidate)
      ? directCandidate
      : uniqueCandidates[0];
    picked.candidates = uniqueCandidates;
    return picked;
  }

  function buildScopedCandidateElements(anchorElement, hitStack) {
    const scoped = [];
    const seen = new Set();
    const add = (element) => {
      if (!element || element.nodeType !== 1 || isPickerUiNode(element) || seen.has(element)) return;
      scoped.push(element);
      seen.add(element);
    };

    add(anchorElement);

    if (anchorElement) {
      const parent = anchorElement.parentElement;
      if (isInlineTextElement(parent)) add(parent);
      for (const child of Array.from(anchorElement.children || []).slice(0, 12)) {
        if (isInlineTextElement(child) || isMediaElement(child) || isFormValueElement(child)) add(child);
      }
      for (const sibling of [anchorElement.previousElementSibling, anchorElement.nextElementSibling]) {
        if (isInlineTextElement(sibling) || isMediaElement(sibling) || isFormValueElement(sibling)) {
          add(sibling);
        }
      }
    }

    for (const element of hitStack.slice(0, 3)) {
      if (element === anchorElement || isInlineTextElement(element) || isMediaElement(element) || isFormValueElement(element)) {
        add(element);
      }
    }

    return scoped;
  }

  function isMediaElement(element) {
    const tag = (element?.tagName || "").toUpperCase();
    return ["IMG", "SVG", "CANVAS", "PICTURE"].includes(tag);
  }

  function isFormValueElement(element) {
    const tag = (element?.tagName || "").toUpperCase();
    return ["INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(tag) || element?.hasAttribute?.("value");
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

  function renderSelectionValue(selection) {
    const isImage = selection?.extract?.type === "image" && selection?.value;
    if (isImage) {
      return `<img class="__cm_preview" src="${escapeHtml(selection.value)}" alt="preview" />`;
    }
    return escapeHtml(selection?.value || t("noValue"));
  }

  function renderModalHeader(title) {
    return `
      <div class="__cm_modal_header">
        <button class="__cm_modal_icon" id="__cm_back" type="button" title="${escapeHtml(t("back"))}" aria-label="${escapeHtml(t("back"))}">‹</button>
        <div class="__cm_title">${escapeHtml(title)}</div>
        <button class="__cm_modal_icon" id="__cm_close" type="button" title="${escapeHtml(t("close"))}" aria-label="${escapeHtml(t("close"))}">×</button>
      </div>
    `;
  }

  function bindModalChrome(onBack) {
    const backBtn = modal.querySelector("#__cm_back");
    const closeBtn = modal.querySelector("#__cm_close");
    backBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onBack?.();
    });
    closeBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cancelPicker();
    });
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
    const candidateLabel = currentCandidates.length > 1
      ? ` ${currentCandidateIndex + 1}/${currentCandidates.length}`
      : "";
    if (data.type === "attr") {
      label.textContent = `${t("typeAttr")}: ${data.attr}${candidateLabel}`;
    } else {
      const typeLabel = data.type === "image" ? t("typeImage") : data.type === "value" ? t("typeValue") : t("typeText");
      label.textContent = `${typeLabel}${candidateLabel}`;
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

  function updateHintPosition(event) {
    if (!event || hint.style.display === "none") return;
    const offset = 72;
    hint.style.left = "0px";
    hint.style.top = "0px";
    const rect = hint.getBoundingClientRect();
    let left = event.clientX - Math.min(160, rect.width / 2);
    let top = event.clientY - rect.height - offset;
    if (top < 8) top = event.clientY + 24;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    hint.style.left = `${Math.max(8, left)}px`;
    hint.style.top = `${Math.max(8, top)}px`;
  }

  function enterSelectMode() {
    selecting = true;
    closeCandidateMenu();
    currentPicked = null;
    currentCandidates = [];
    currentCandidateIndex = 0;
    tooltip.style.display = "none";
    hint.style.display = "block";
    highlightBox.style.zIndex = "";
    highlightBox.style.display = "none";
  }

  function exitSelectMode() {
    selecting = false;
    closeCandidateMenu();
    currentPicked = null;
    currentCandidates = [];
    currentCandidateIndex = 0;
    tooltip.style.display = "none";
    hint.style.display = "none";
    highlightBox.style.zIndex = "";
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

  function getCandidateMeta(candidate, index) {
    const element = candidate?.element;
    const data = candidate?.data || {};
    const tag = element?.tagName ? element.tagName.toLowerCase() : "element";
    const typeLabel = data.type === "image"
      ? t("typeImage")
      : data.type === "value"
        ? t("typeValue")
        : data.type === "attr"
          ? `${t("typeAttr")}: ${data.attr || ""}`
          : data.type === "ownText"
            ? "own text"
            : data.type === "textToken"
              ? "text token"
              : t("typeText");
    return `${index + 1}. ${tag} · ${typeLabel}`;
  }

  function closeCandidateMenu() {
    candidateMenuOpen = false;
    candidateMenu.style.display = "none";
    candidateMenu.innerHTML = "";
  }

  function positionCandidateMenu(clientX, clientY) {
    const offset = 10;
    candidateMenu.style.display = "block";
    let left = clientX + offset;
    let top = clientY + offset;
    const rect = candidateMenu.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) left = clientX - rect.width - offset;
    if (top + rect.height > window.innerHeight) top = clientY - rect.height - offset;
    candidateMenu.style.left = `${Math.max(8, left)}px`;
    candidateMenu.style.top = `${Math.max(8, top)}px`;
  }

  function activateCandidate(index) {
    const candidate = currentCandidates[index];
    if (!candidate) return;
    currentCandidateIndex = index;
    currentPicked = candidate;
    updateHighlight(candidate.element);
    updateTooltip({ clientX: lastPointerX, clientY: lastPointerY }, candidate.data);
    candidateMenu.querySelectorAll(".__cm_candidate_option").forEach((node, nodeIndex) => {
      node.classList.toggle("__cm_active", nodeIndex === index);
    });
  }

  function showCandidateMenu(event) {
    if (abortIfContextLost()) return;
    if (!currentCandidates.length) {
      updatePickedAtPoint(event);
    }
    if (!currentCandidates.length) return;
    candidateMenuOpen = true;
    candidateMenu.innerHTML = "";
    const title = document.createElement("div");
    title.className = "__cm_candidate_title";
    title.textContent = t("candidateMenuTitle");
    candidateMenu.appendChild(title);
    currentCandidates.forEach((candidate, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "__cm_candidate_option";
      option.innerHTML = `
        <span class="__cm_candidate_meta">${escapeHtml(getCandidateMeta(candidate, index))}</span>
        <span class="__cm_candidate_value">${escapeHtml(candidate?.data?.value || t("noValue"))}</span>
      `;
      option.addEventListener("mouseenter", () => activateCandidate(index));
      option.addEventListener("click", (menuEvent) => {
        menuEvent.preventDefault();
        menuEvent.stopPropagation();
        activateCandidate(index);
        confirmCurrentSelection({ clientX: lastPointerX, clientY: lastPointerY }, currentPicked);
      });
      candidateMenu.appendChild(option);
    });
    positionCandidateMenu(event.clientX, event.clientY);
    activateCandidate(currentCandidateIndex);
  }

  function renderConfirm(selection) {
    if (abortIfContextLost()) return;
    let currentSelection = { ...selection };
    showOverlay();
    modal.innerHTML = `
      ${renderModalHeader(t("confirmTitle"))}
      <div class="__cm_block">
        <div class="__cm_label">${t("valueLabel")}</div>
        <div class="__cm_value" id="__cm_valuePreview">${renderSelectionValue(currentSelection)}</div>
      </div>
      <div class="__cm_block">
        <div class="__cm_label">${t("selectorLabel")}</div>
        <input id="__cm_selectorInput" class="__cm_selector_input" type="text" value="${escapeHtml(currentSelection.selector || "")}" readonly />
        <div class="__cm_selector_hint" id="__cm_selectorHint"></div>
      </div>
      <div class="__cm_question">${t("confirmQuestion")}</div>
      <div class="__cm_actions">
        <button class="__cm_btn __cm_btn_secondary" id="__cm_reselect">${t("reselect")}</button>
        <button class="__cm_btn __cm_btn_secondary" id="__cm_manualSelector">${t("manualSelector")}</button>
        <button class="__cm_btn __cm_btn_primary" id="__cm_confirm">${t("confirm")}</button>
      </div>
      <div class="__cm_status" id="__cm_status"></div>
    `;

    const reselectBtn = modal.querySelector("#__cm_reselect");
    const manualBtn = modal.querySelector("#__cm_manualSelector");
    const confirmBtn = modal.querySelector("#__cm_confirm");
    const selectorInput = modal.querySelector("#__cm_selectorInput");
    const selectorHint = modal.querySelector("#__cm_selectorHint");
    const valuePreview = modal.querySelector("#__cm_valuePreview");
    let selectorValid = true;

    const setSelectorHint = (message, isError = false) => {
      selectorHint.textContent = message || "";
      selectorHint.classList.toggle("__cm_error", Boolean(isError));
    };

    const refreshManualSelection = () => {
      const rawSelector = String(selectorInput.value || "").trim();
      if (!rawSelector) {
        selectorValid = false;
        setSelectorHint(t("manualSelectorHint"), false);
        updateHighlight(null);
        return;
      }

      let element = null;
      try {
        element = document.querySelector(rawSelector);
      } catch {
        selectorValid = false;
        setSelectorHint(t("manualSelectorInvalid"), true);
        updateHighlight(null);
        return;
      }

      if (!element || isPickerUiNode(element)) {
        selectorValid = false;
        setSelectorHint(t("manualSelectorNotFound"), true);
        updateHighlight(null);
        return;
      }

      currentSelection = buildSelection(element, null, rawSelector);
      selectorValid = true;
      valuePreview.innerHTML = renderSelectionValue(currentSelection);
      highlightBox.style.zIndex = "2147483645";
      updateHighlight(element);
      setSelectorHint(t("manualSelectorUpdated"), false);
    };

    bindModalChrome(() => {
      hideOverlay();
      enterSelectMode();
    });

    reselectBtn.addEventListener("click", () => {
      hideOverlay();
      enterSelectMode();
    });

    manualBtn.addEventListener("click", () => {
      selectorInput.readOnly = false;
      selectorInput.classList.add("__cm_manual_active");
      setSelectorHint(t("manualSelectorHint"), false);
      selectorInput.focus();
      selectorInput.select();
    });

    selectorInput.addEventListener("input", refreshManualSelection);

    confirmBtn.addEventListener("click", () => {
      if (!selectorValid) {
        selectorInput.focus();
        return;
      }
      highlightBox.style.zIndex = "";
      updateHighlight(null);
      renderSchedule(currentSelection);
    });
  }

  function renderSchedule(selection) {
    if (abortIfContextLost()) return;
    const isUpdate = currentMode === "update" && currentMonitorId;
    showOverlay();
    const isImage = selection?.extract?.type === "image" && selection?.value;
    modal.innerHTML = `
      ${renderModalHeader(isUpdate ? t("updateTitle") : t("createTitle"))}
      <div class="__cm_block">
        <div class="__cm_label">${t("selectedValue")}</div>
        <div class="__cm_value">${renderSelectionValue(selection)}</div>
      </div>
      <div class="__cm_block __cm_block_tight ${isImage ? "__cm_hidden" : ""}" id="__cm_filterSection">
        <div class="__cm_label">${t("filterLabel")}</div>
        <div class="__cm_filter_row">
          <select id="__cm_filterMode" class="__cm_select">
            <option value="none">${t("filterNone")}</option>
            <option value="ignore_contains">${t("filterIgnoreContains")}</option>
            <option value="ignore_not_contains">${t("filterIgnoreNotContains")}</option>
            <option value="ignore_regex">${t("filterIgnoreRegex")}</option>
          </select>
        </div>
        <div id="__cm_filterDetail" class="__cm_filter_detail __cm_hidden">
          <div id="__cm_filterTokens" class="__cm_token_input">
            <input id="__cm_filterValueInput" class="__cm_token_field" type="text" autocomplete="off" placeholder="${escapeHtml(t("filterValuesPlaceholder"))}" />
          </div>
        </div>
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
    const filterMode = modal.querySelector("#__cm_filterMode");
    const filterDetail = modal.querySelector("#__cm_filterDetail");
    const filterTokens = modal.querySelector("#__cm_filterTokens");
    const filterValueInput = modal.querySelector("#__cm_filterValueInput");
    const registerBtn = modal.querySelector("#__cm_register");
    const statusEl = modal.querySelector("#__cm_status");
    const filterValues = [];
    let composingFilterValue = false;

    bindModalChrome(() => {
      renderConfirm(selection);
    });

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

    function updateFilterFields() {
      const hasFilter = filterMode.value !== "none";
      filterDetail.classList.toggle("__cm_hidden", !hasFilter);
    }

    filterMode.addEventListener("change", updateFilterFields);
    updateFilterFields();

    function renderFilterTokens() {
      filterTokens.querySelectorAll(".__cm_token").forEach((node) => node.remove());
      for (const value of filterValues) {
        const token = document.createElement("span");
        token.className = "__cm_token";
        token.dataset.value = value;

        const text = document.createElement("span");
        text.className = "__cm_token_text";
        text.textContent = value;
        token.appendChild(text);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "__cm_token_remove";
        remove.textContent = "x";
        remove.title = t("delete");
        remove.addEventListener("click", () => {
          const index = filterValues.indexOf(value);
          if (index >= 0) filterValues.splice(index, 1);
          renderFilterTokens();
          filterValueInput.focus();
        });
        token.appendChild(remove);
        filterTokens.insertBefore(token, filterValueInput);
      }
    }

    function addFilterValue(rawValue) {
      const value = String(rawValue || "").trim();
      if (!value) return;
      if (filterValues.includes(value)) {
        filterValueInput.value = "";
        return;
      }
      filterValues.push(value);
      filterValueInput.value = "";
      renderFilterTokens();
    }

    filterTokens.addEventListener("click", () => {
      filterValueInput.focus();
    });

    filterValueInput.addEventListener("keydown", (event) => {
      if (event.isComposing || composingFilterValue) return;
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addFilterValue(filterValueInput.value);
        return;
      }
      if (event.key === "Backspace" && !filterValueInput.value && filterValues.length) {
        filterValues.pop();
        renderFilterTokens();
      }
    });

    filterValueInput.addEventListener("blur", () => {
      addFilterValue(filterValueInput.value);
    });
    filterValueInput.addEventListener("compositionstart", () => {
      composingFilterValue = true;
    });
    filterValueInput.addEventListener("compositionend", () => {
      composingFilterValue = false;
    });
    filterValueInput.addEventListener("keyup", (event) => {
      if (event.key !== "Enter" || event.isComposing || composingFilterValue) return;
      event.preventDefault();
      addFilterValue(filterValueInput.value);
    });

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
        const updates = buildUpdate(selection, modal);
        response = await sendMessage({ type: "updateMonitorFields", id: currentMonitorId, updates });
      } else {
        const schedule = buildSchedule(modal);
        const filter = buildFilter(modal);
        const monitor = buildMonitor(selection, schedule, filter);
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

  function buildFilter(modalRoot) {
    if (modalRoot.querySelector("#__cm_filterSection")?.classList.contains("__cm_hidden")) {
      return null;
    }
    const mode = modalRoot.querySelector("#__cm_filterMode")?.value || "none";
    const inputValue = String(modalRoot.querySelector("#__cm_filterValueInput")?.value || "").trim();
    const values = Array.from(modalRoot.querySelectorAll("#__cm_filterTokens .__cm_token"))
      .map((item) => item.dataset.value || item.textContent || "")
      .concat(inputValue ? [inputValue] : [])
      .map((item) => item.trim())
      .filter(Boolean);
    if (mode === "none" || !values.length) return null;
    return {
      mode,
      values
    };
  }

  function parseTime(value) {
    const parts = String(value || "09:00").split(":");
    const hour = Number(parts[0] || 0);
    const minute = Number(parts[1] || 0);
    return [hour, minute];
  }

  function buildMonitor(selection, schedule, filter) {
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
      schedule,
      filter
    };
  }

  function buildUpdate(selection, modalRoot) {
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
      lastDebug: null,
      filter: buildFilter(modalRoot)
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
          resolve(response);
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || "send_failed" });
      }
    });
  }

  function updatePickedAtPoint(event) {
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
    const pickedIndex = currentCandidates.indexOf(picked);
    currentCandidateIndex = pickedIndex >= 0 ? pickedIndex : 0;
    currentPicked = picked;
    updateHighlight(currentPicked.element);
    updateTooltip(event, currentPicked.data);
  }

  function onMouseMove(event) {
    if (!selecting) return;
    if (abortIfContextLost()) return;
    if (candidateMenuOpen && candidateMenu.style.display !== "none") return;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    updateHintPosition(event);
    pendingPointerEvent = {
      clientX: event.clientX,
      clientY: event.clientY
    };
    if (pickFrameRequested) return;
    pickFrameRequested = true;
    requestAnimationFrame(() => {
      pickFrameRequested = false;
      if (!selecting || !pendingPointerEvent) return;
      updatePickedAtPoint(pendingPointerEvent);
    });
  }

  async function confirmCurrentSelection(event, selectedPicked = null) {
    if (!selecting) return;
    if (abortIfContextLost()) return;
    const picked = selectedPicked?.element?.isConnected
      ? selectedPicked
      : currentPicked?.element?.isConnected
      ? currentPicked
      : pickElementAtPoint(event.clientX, event.clientY);
    const targetElement = picked?.element || currentTarget;
    if (!targetElement) return;
    await ensurePickerState();
    const selector = getSelector(targetElement);
    const data = picked?.data || getPreferredValue(targetElement);
    const selection = buildSelection(targetElement, data, selector);

    exitSelectMode();
    renderConfirm(selection);
  }

  function buildSelection(element, data = null, selector = "") {
    const valueData = data || getPreferredValue(element);
    return {
      selector: selector || getSelector(element),
      url: location.href,
      title: document.title || "",
      value: valueData.value,
      extract: buildExtract(valueData),
      displayStyle: shouldKeepDisplayStyle(element, valueData)
        ? { ...buildDisplayStyle(element), __noInnerText: true }
        : null
    };
  }

  function buildExtract(data) {
    if (data.type === "attr") return { type: data.type, attr: data.attr };
    if (data.type === "textToken") return { type: data.type, index: data.index };
    return { type: data.type };
  }

  async function onClick(event) {
    if (!selecting) return;
    if (abortIfContextLost()) return;
    if (isPickerUiNode(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    closeCandidateMenu();
    updatePickedAtPoint(event);
    if (currentCandidates.length > 1) {
      showCandidateMenu(event);
      return;
    }
    await confirmCurrentSelection(event);
  }

  async function onKeyDown(event) {
    if (event.key !== "Escape") return;
    if (abortIfContextLost()) return;
    event.preventDefault();
    event.stopPropagation();
    if (candidateMenuOpen) {
      closeCandidateMenu();
      return;
    }
    await ensurePickerState();
    cancelPicker();
  }

  function resetPendingPick() {
    pickFrameRequested = false;
    pendingPointerEvent = null;
  }

  function cancelPicker() {
    sendMessage({ type: "pickerCancelled", requestId: currentRequestId }).finally(() => {
      cleanup();
    });
  }

  function cleanup() {
    if (!window.__cmPickerActive) return;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    resetPendingPick();
    if (currentTarget) {
      currentTarget.classList.remove("__cm_hover_target");
    }
    highlightBox.remove();
    tooltip.remove();
    hint.remove();
    candidateMenu.remove();
    overlay.remove();
    window.__cmPickerActive = false;
    window.__cmPickerCleanup = null;
  }

  window.__cmPickerCleanup = cleanup;
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  enterSelectMode();
})();
