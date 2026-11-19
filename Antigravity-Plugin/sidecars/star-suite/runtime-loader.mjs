import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve runtime root: staged `./runtime` inside installed plugins,
 * or the parent repository root when running from source.
 */
export function resolveSuiteRoot(baseDir = __dirname) {
  const staged = path.join(baseDir, "runtime");
  if (fs.existsSync(path.join(staged, "Antigravity-Dream-Skin"))) {
    return { root: staged, staged: true };
  }
  return { root: path.resolve(baseDir, "../../.."), staged: false };
}

export function loadDreamSkinModules(baseDir = __dirname) {
  const { root, staged } = resolveSuiteRoot(baseDir);
  const skinRoot = path.join(root, "Antigravity-Dream-Skin");
  const widgetSettingsModPath = path.join(root, "Antigravity-Cat-Widget/src/domain/settings.cjs");
  const { DreamSkinSettings, DEFAULT_SETTINGS, DEFAULT_GLASS, DEFAULT_FONT } = require(
    path.join(skinRoot, "src/domain/settings.cjs")
  );
  const { DreamSkinThemeLoader } = require(
    path.join(skinRoot, "src/domain/theme-loader.cjs")
  );
  const { HostController } = require(
    path.join(skinRoot, "src/domain/host-controller.cjs")
  );
  const {
    LocalMediaServer,
    detectMediaKind,
    mimeTypeForPath,
  } = require(path.join(skinRoot, "src/domain/media-server.cjs"));

  let WidgetSettingsManager = null;
  let DEFAULT_WIDGET_SETTINGS = null;
  let ALLOWED_SOUND_SETS = ["original", "wood-tap", "bubble-pop", "soft-spring"];
  if (fs.existsSync(widgetSettingsModPath)) {
    const wMod = require(widgetSettingsModPath);
    WidgetSettingsManager = wMod.SettingsManager;
    DEFAULT_WIDGET_SETTINGS = wMod.DEFAULT_SETTINGS;
    ALLOWED_SOUND_SETS = wMod.ALLOWED_SOUND_SETS || ALLOWED_SOUND_SETS;
  }

  return {
    root,
    skinRoot,
    staged,
    DreamSkinSettings,
    DEFAULT_SETTINGS,
    DEFAULT_GLASS,
    DEFAULT_FONT,
    DreamSkinThemeLoader,
    HostController,
    LocalMediaServer,
    detectMediaKind,
    mimeTypeForPath,
    WidgetSettingsManager,
    DEFAULT_WIDGET_SETTINGS,
    ALLOWED_SOUND_SETS,
  };
}

export async function loadSidecarSdk() {
  const candidates = [
    process.env.ANTIGRAVITY_SIDECAR_SDK,
    path.join(os.homedir(), ".gemini/config/node_modules/sidecar_sdk/index.mjs"),
    path.join(os.homedir(), ".gemini/antigravity/lib/node_modules/sidecar_sdk/index.mjs"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
  }
  return import("sidecar_sdk");
}
