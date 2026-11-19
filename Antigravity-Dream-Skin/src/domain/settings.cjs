const os = require("node:os");
const path = require("node:path");
const { readJson, writeJson, finite, bool } = require("../../../shared/storage.cjs");

const GLASS_REGION_KEYS = ["sidebar", "content", "overlay", "control", "header", "bar"];

const DEFAULT_GLASS = {
  themeStyle: "star-neko",
  tint: "#ffffff",
  veil: 0,
  radius: 16,
  regions: {
    sidebar: { fill: 78, blur: 18 },
    content: { fill: 60, blur: 22 },
    overlay: { fill: 68, blur: 24 },
    control: { fill: 72, blur: 14 },
    header: { fill: 84, blur: 14 },
    bar: { fill: 80, blur: 14 },
  },
};

const FONT_ROLE_KEYS = ["main", "secondary", "muted", "faint"];

const DEFAULT_FONT = {
  accent: "",
  darkSeparate: false,
  colors: { main: "", secondary: "", muted: "", faint: "" },
  colorsDark: { main: "", secondary: "", muted: "", faint: "" },
};

const DEFAULT_SETTINGS = {
  enabled: false,
  outputMode: "transparent",
  positionX: 50,
  positionY: 50,
  zoom: 1,
  fit: "adaptive",
  scrim: 12,
  opacity: 55,
  wallpaperId: "gemini-character-sheet-v1",
  mediaType: "preset",
  customMediaPath: "",
  recentMedia: [],
  videoMuted: true,
  videoPlaybackRate: 1,
  videoPaused: false,
  videoSmoothMode: true,
  chatWidth: 0,
  widgetAutoLaunch: true,
  widgetHideTray: true,
  glass: DEFAULT_GLASS,
  font: DEFAULT_FONT,
  protectEditor: true,
  protectTerminal: true,
};

const VALID_MEDIA_TYPES = new Set(["preset", "image", "video"]);

function sanitizePath(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || /[\r\n\0]/.test(trimmed)) return "";
  return trimmed;
}

function sanitizeRecentMedia(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const clean = sanitizePath(item);
    if (!clean) continue;
    const key = process.platform === "win32" ? clean.toLowerCase() : clean;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

function sanitizeHexColor(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function sanitizeGlass(raw, current = DEFAULT_GLASS) {
  const src = raw && typeof raw === "object" ? raw : {};
  const srcRegions = src.regions && typeof src.regions === "object" ? src.regions : {};
  const curRegions = current?.regions || DEFAULT_GLASS.regions;
  const regions = {};
  for (const key of GLASS_REGION_KEYS) {
    const def = curRegions[key] || DEFAULT_GLASS.regions[key];
    const part = srcRegions[key] && typeof srcRegions[key] === "object" ? srcRegions[key] : {};
    regions[key] = {
      fill: Math.round(finite(part.fill, def.fill, 0, 100)),
      blur: Math.round(finite(part.blur, def.blur, 0, 40)),
    };
  }
  return {
    themeStyle:
      "themeStyle" in src
        ? src.themeStyle === "official"
          ? "official"
          : "star-neko"
        : current?.themeStyle === "official"
          ? "official"
          : "star-neko",
    tint:
      "tint" in src
        ? sanitizeHexColor(src.tint, "")
        : sanitizeHexColor(current?.tint, DEFAULT_GLASS.tint),
    veil: Math.round(finite(src.veil, current?.veil ?? DEFAULT_GLASS.veil, 0, 95)),
    radius: Math.round(finite(src.radius, current?.radius ?? DEFAULT_GLASS.radius, 8, 24)),
    regions,
  };
}

function sanitizeFontRoleMap(raw, fallback) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of FONT_ROLE_KEYS) {
    out[key] = key in src ? sanitizeHexColor(src[key], "") : sanitizeHexColor(fallback?.[key], "");
  }
  return out;
}

function sanitizeFont(raw, current = DEFAULT_FONT) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    accent:
      "accent" in src
        ? sanitizeHexColor(src.accent, "")
        : sanitizeHexColor(current?.accent, ""),
    darkSeparate: bool(src.darkSeparate, Boolean(current?.darkSeparate)),
    colors: sanitizeFontRoleMap(src.colors, current?.colors || DEFAULT_FONT.colors),
    colorsDark: sanitizeFontRoleMap(src.colorsDark, current?.colorsDark || DEFAULT_FONT.colorsDark),
  };
}

function cloneSettings(data) {
  return {
    ...data,
    recentMedia: [...data.recentMedia],
    glass: {
      themeStyle: data.glass.themeStyle,
      tint: data.glass.tint,
      veil: data.glass.veil,
      radius: data.glass.radius,
      regions: Object.fromEntries(
        GLASS_REGION_KEYS.map((k) => [k, { ...data.glass.regions[k] }])
      ),
    },
    font: {
      accent: data.font.accent,
      darkSeparate: data.font.darkSeparate,
      colors: { ...data.font.colors },
      colorsDark: { ...data.font.colorsDark },
    },
  };
}

class DreamSkinSettings {
  constructor(file = path.join(os.homedir(), ".antigravity-dream-skin/settings.json")) {
    this.filePath = file;
    this.data = this.sanitize(readJson(file, DEFAULT_SETTINGS));
  }

  sanitize(v) {
    const raw = v && typeof v === "object" ? v : {};
    return {
      ...DEFAULT_SETTINGS,
      outputMode: raw.outputMode === "glass" ? "glass" : "transparent",
      enabled: bool(raw.enabled, false),
      positionX: finite(raw.positionX, 50, 0, 100),
      positionY: finite(raw.positionY, 50, 0, 100),
      zoom: finite(raw.zoom, 1, 1, 2),
      fit: ["cover", "contain", "adaptive"].includes(raw.fit) ? raw.fit : "adaptive",
      scrim: finite(raw.scrim, 12, 0, 60),
      opacity: finite(raw.opacity, 55, 0, 100),
      mediaType: VALID_MEDIA_TYPES.has(raw.mediaType) ? raw.mediaType : "preset",
      customMediaPath: sanitizePath(raw.customMediaPath),
      recentMedia: sanitizeRecentMedia(raw.recentMedia),
      videoMuted: bool(raw.videoMuted, true),
      videoPlaybackRate: finite(raw.videoPlaybackRate, 1, 0.25, 2),
      videoPaused: bool(raw.videoPaused, false),
      videoSmoothMode: bool(raw.videoSmoothMode, true),
      chatWidth: (() => {
        const w = Math.round(finite(raw.chatWidth, 0, 0, 100));
        return w === 0 ? 0 : Math.max(45, w);
      })(),
      widgetAutoLaunch: bool(raw.widgetAutoLaunch, true),
      widgetHideTray: bool(raw.widgetHideTray, true),
      glass: sanitizeGlass(raw.glass, DEFAULT_GLASS),
      font: sanitizeFont(raw.font, DEFAULT_FONT),
      protectEditor: true,
      protectTerminal: true,
    };
  }

  update(v) {
    const patch = v && typeof v === "object" ? v : {};
    const mergedGlass = patch.glass
      ? sanitizeGlass(
          {
            ...this.data.glass,
            ...patch.glass,
            regions: Object.fromEntries(
              GLASS_REGION_KEYS.map((k) => [
                k,
                {
                  ...this.data.glass.regions[k],
                  ...(patch.glass.regions?.[k] || {}),
                },
              ])
            ),
          },
          this.data.glass
        )
      : this.data.glass;

    const mergedFont = patch.font
      ? sanitizeFont(
          {
            ...this.data.font,
            ...patch.font,
            colors: { ...this.data.font.colors, ...(patch.font.colors || {}) },
            colorsDark: { ...this.data.font.colorsDark, ...(patch.font.colorsDark || {}) },
          },
          this.data.font
        )
      : this.data.font;

    this.data = this.sanitize({
      ...this.data,
      ...patch,
      glass: mergedGlass,
      font: mergedFont,
    });
    writeJson(this.filePath, this.data);
    return this.getAll();
  }

  get(k) {
    return this.data[k];
  }

  getAll() {
    return cloneSettings(this.data);
  }
}

module.exports = {
  DreamSkinSettings,
  DEFAULT_SETTINGS,
  DEFAULT_GLASS,
  DEFAULT_FONT,
  GLASS_REGION_KEYS,
  FONT_ROLE_KEYS,
  sanitizeHexColor,
};
