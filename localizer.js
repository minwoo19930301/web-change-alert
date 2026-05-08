(() => {
  const DEFAULT_LANGUAGE = "en";
  const SETTINGS_KEY = "settings";

  const LANGUAGE_OPTIONS = [
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

  const LOCALE_FOLDER_BY_LANGUAGE = {
    en: "en",
    ko: "ko",
    ja: "ja",
    "zh-CN": "zh_CN",
    "zh-TW": "zh_TW",
    es: "es",
    ru: "ru",
    fr: "fr",
    de: "de",
    "pt-BR": "pt_BR",
    it: "it",
    ar: "ar"
  };

  const RTL_LANGUAGES = new Set(["ar"]);
  const messageCache = new Map();

  function formatTemplate(template, vars = {}) {
    let output = String(template || "");
    for (const [name, value] of Object.entries(vars)) {
      output = output.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
    return output;
  }

  function normalizeLanguage(value) {
    const input = String(value || "").trim().toLowerCase();
    if (!input) return DEFAULT_LANGUAGE;

    if (input === "auto") return "auto";
    if (input.startsWith("ko")) return "ko";
    if (input.startsWith("ja")) return "ja";
    if (input.startsWith("es")) return "es";
    if (input.startsWith("ru")) return "ru";
    if (input.startsWith("fr")) return "fr";
    if (input.startsWith("de")) return "de";
    if (input.startsWith("it")) return "it";
    if (input.startsWith("ar")) return "ar";
    if (input.startsWith("pt-br") || input === "pt") return "pt-BR";
    if (input.startsWith("zh-hans") || input.startsWith("zh-cn") || input.startsWith("zh-sg")) return "zh-CN";
    if (input.startsWith("zh-hant") || input.startsWith("zh-tw") || input.startsWith("zh-hk") || input.startsWith("zh-mo")) return "zh-TW";
    if (input.startsWith("en")) return "en";
    return DEFAULT_LANGUAGE;
  }

  function getUiLanguage() {
    const ui = safeGetUiLanguage();
    const normalized = normalizeLanguage(ui);
    return normalized === "auto" ? DEFAULT_LANGUAGE : normalized;
  }

  function safeGetUiLanguage() {
    try {
      return globalThis.chrome?.i18n?.getUILanguage?.() || "";
    } catch {
      return "";
    }
  }

  function safeGetMessage(key) {
    try {
      return globalThis.chrome?.i18n?.getMessage?.(key) || "";
    } catch {
      return "";
    }
  }

  function safeGetRuntimeUrl(path) {
    try {
      if (!globalThis.chrome?.runtime?.id) return "";
      return globalThis.chrome?.runtime?.getURL?.(path) || "";
    } catch {
      return "";
    }
  }

  function getLocaleFolder(language) {
    const normalized = normalizeLanguage(language);
    return LOCALE_FOLDER_BY_LANGUAGE[normalized] || LOCALE_FOLDER_BY_LANGUAGE[DEFAULT_LANGUAGE];
  }

  async function loadMessages(language) {
    try {
      const normalized = normalizeLanguage(language);
      if (normalized === "auto") return null;
      if (messageCache.has(normalized)) {
        return messageCache.get(normalized);
      }

      const folder = getLocaleFolder(normalized);
      const url = safeGetRuntimeUrl(`_locales/${folder}/messages.json`);
      if (!url) {
        messageCache.set(normalized, null);
        return null;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`load_failed_${response.status}`);
      const json = await response.json();
      messageCache.set(normalized, json);
      return json;
    } catch {
      const normalized = normalizeLanguage(language);
      messageCache.set(normalized, null);
      return null;
    }
  }

  function buildChromeTranslator() {
    return {
      t(key, vars = {}) {
        const template = safeGetMessage(key) || key;
        return formatTemplate(template, vars);
      }
    };
  }

  async function createTranslator(preferredLanguage = "auto") {
    try {
      const preferred = normalizeLanguage(preferredLanguage || "auto");
      const effective = preferred === "auto" ? getUiLanguage() : preferred;

      if (preferred === "auto") {
        return {
          preferred,
          effective,
          isRtl: RTL_LANGUAGES.has(effective),
          ...buildChromeTranslator()
        };
      }

      const messages = await loadMessages(effective);
      return {
        preferred,
        effective,
        isRtl: RTL_LANGUAGES.has(effective),
        t(key, vars = {}) {
          const template = messages?.[key]?.message || safeGetMessage(key) || key;
          return formatTemplate(template, vars);
        }
      };
    } catch {
      return {
        preferred: "auto",
        effective: DEFAULT_LANGUAGE,
        isRtl: false,
        t(key, vars = {}) {
          return formatTemplate(safeGetMessage(key) || key, vars);
        }
      };
    }
  }

  async function getSettingsLanguage() {
    try {
      const data = await chrome.storage.local.get([SETTINGS_KEY]);
      const preferred = data?.[SETTINGS_KEY]?.language;
      if (!preferred) return "auto";
      return normalizeLanguage(preferred);
    } catch {
      return "auto";
    }
  }

  async function setSettingsLanguage(language) {
    const normalized = normalizeLanguage(language || "auto");
    const nextLanguage = normalized === "auto" ? "auto" : normalized;
    try {
      const data = await chrome.storage.local.get([SETTINGS_KEY]);
      const nextSettings = {
        ...(data?.[SETTINGS_KEY] || {}),
        language: nextLanguage,
        languageChosen: true
      };
      await chrome.storage.local.set({ [SETTINGS_KEY]: nextSettings });
    } catch {}
    return nextLanguage;
  }

  function getLanguageOptions() {
    return LANGUAGE_OPTIONS.slice();
  }

  globalThis.WebChangeLocalizer = {
    DEFAULT_LANGUAGE,
    normalizeLanguage,
    getUiLanguage,
    getLanguageOptions,
    getSettingsLanguage,
    setSettingsLanguage,
    createTranslator,
    isRtl(language) {
      return RTL_LANGUAGES.has(normalizeLanguage(language));
    }
  };
})();
