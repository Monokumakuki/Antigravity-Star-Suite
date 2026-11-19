import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const PLUGIN_FILES = [
  "plugin.json",
  "README.md",
  "assets/logo.svg",
  "sidecars/star-suite/sidecar.json",
  "sidecars/star-suite/main.mjs",
  "sidecars/star-suite/runtime-loader.mjs",
  "sidecars/star-suite/widget-supervisor.mjs",
  "sidecars/star-suite/media-picker.mjs",
  "sidecars/star-suite/web/index.html",
  "sidecars/star-suite/web/styles.css",
  "sidecars/star-suite/web/app.js",
];

const SKIN_RUNTIME_FILES = [
  "src/domain/settings.cjs",
  "src/domain/theme-loader.cjs",
  "src/domain/host-controller.cjs",
  "src/domain/media-server.cjs",
  "src/host/theme.cjs",
  "assets/wallpapers/gemini-character-sheet-v1/manifest.json",
  "assets/wallpapers/gemini-character-sheet-v1/wallpaper.png",
];

const WIDGET_RUNTIME_FILES = ["src/domain/settings.cjs"];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function collectFilesRecursive(dirPath, baseDir = dirPath, acc = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(full, baseDir, acc);
    } else if (entry.isFile()) {
      acc.push(path.relative(baseDir, full));
    }
  }
  return acc;
}

function copyFileClean(src, dst) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required source file: ${src}`);
  }
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

export function defaultPluginTargetDir() {
  return path.join(os.homedir(), ".gemini", "config", "plugins", "antigravity-star-suite");
}

export function defaultConfigFilePath() {
  return path.join(os.homedir(), ".gemini", "config", "config.json");
}

export function installStarSuitePlugin(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const targetDir = path.resolve(options.targetDir || defaultPluginTargetDir());
  const configFile = path.resolve(options.configFile || defaultConfigFilePath());
  const enableInConfig = options.enableInConfig !== false;
  const dryRun = Boolean(options.dryRun);

  const pluginSrcDir = path.join(repoRoot, "Antigravity-Plugin");
  const skinSrcDir = path.join(repoRoot, "Antigravity-Dream-Skin");
  const widgetSrcDir = path.join(repoRoot, "Antigravity-Cat-Widget");
  const sharedSrcDir = path.join(repoRoot, "shared");
  const stagedRuntimeRoot = path.join(targetDir, "sidecars", "star-suite", "runtime");

  const plannedCopies = [];

  for (const rel of PLUGIN_FILES) {
    plannedCopies.push({
      src: path.join(pluginSrcDir, rel),
      dst: path.join(targetDir, rel),
    });
  }

  for (const rel of collectFilesRecursive(sharedSrcDir)) {
    plannedCopies.push({
      src: path.join(sharedSrcDir, rel),
      dst: path.join(stagedRuntimeRoot, "shared", rel),
    });
  }

  for (const rel of SKIN_RUNTIME_FILES) {
    plannedCopies.push({
      src: path.join(skinSrcDir, rel),
      dst: path.join(stagedRuntimeRoot, "Antigravity-Dream-Skin", rel),
    });
  }

  for (const rel of WIDGET_RUNTIME_FILES) {
    plannedCopies.push({
      src: path.join(widgetSrcDir, rel),
      dst: path.join(stagedRuntimeRoot, "Antigravity-Cat-Widget", rel),
    });
  }

  if (!dryRun) {
    // Refresh staged runtime cleanly without deleting unknown top-level plugin files
    fs.rmSync(stagedRuntimeRoot, { recursive: true, force: true });
    for (const pair of plannedCopies) {
      copyFileClean(pair.src, pair.dst);
    }

    if (enableInConfig) {
      let config = {};
      if (fs.existsSync(configFile)) {
        const raw = fs.readFileSync(configFile, "utf8").trim();
        config = raw ? JSON.parse(raw) : {};
      }
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error(`Invalid config JSON structure in ${configFile}`);
      }
      config.plugins = config.plugins && typeof config.plugins === "object" ? config.plugins : {};
      const current = config.plugins["antigravity-star-suite"];
      config.plugins["antigravity-star-suite"] = {
        ...(current && typeof current === "object" ? current : {}),
        enabled: true,
      };
      ensureDir(path.dirname(configFile));
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf8");
    }
  }

  return {
    repoRoot,
    targetDir,
    configFile,
    stagedRuntimeRoot,
    enableInConfig,
    dryRun,
    copiedCount: plannedCopies.length,
    files: plannedCopies.map((p) => p.dst),
  };
}

function parseCliArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--no-enable") {
      opts.enableInConfig = false;
    } else if (arg.startsWith("--target=")) {
      opts.targetDir = arg.slice("--target=".length);
    } else if (arg.startsWith("--config=")) {
      opts.configFile = arg.slice("--config=".length);
    }
  }
  return opts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      [
        "Usage: node tools/install-plugin.mjs [options]",
        "",
        "Options:",
        "  --target=<dir>   Plugin install directory (default: ~/.gemini/config/plugins/antigravity-star-suite)",
        "  --config=<file>  Global Antigravity config path (default: ~/.gemini/config/config.json)",
        "  --no-enable      Copy plugin files without modifying config.json",
        "  --dry-run        Print planned operations without writing files",
      ].join("\n")
    );
    process.exit(0);
  }
  const result = installStarSuitePlugin(opts);
  console.log(
    JSON.stringify(
      {
        status: opts.dryRun ? "dry-run" : "installed",
        targetDir: result.targetDir,
        configFile: result.configFile,
        enabledInConfig: result.enableInConfig,
        copiedCount: result.copiedCount,
      },
      null,
      2
    )
  );
}
