import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadDreamSkinModules, loadSidecarSdk } from "./runtime-loader.mjs";
import { WidgetSupervisor } from "./widget-supervisor.mjs";
import { pickLocalMediaFile } from "./media-picker.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(__dirname, "web");

const ALLOWED_SETTINGS_KEYS = new Set([
  "outputMode",
  "enabled",
  "fit",
  "scrim",
  "opacity",
  "positionX",
  "positionY",
  "zoom",
  "mediaType",
  "customMediaPath",
  "recentMedia",
  "videoMuted",
  "videoPlaybackRate",
  "videoPaused",
  "videoSmoothMode",
  "chatWidth",
  "widgetAutoLaunch",
  "widgetHideTray",
  "glass",
  "font",
]);

const ALLOWED_WIDGET_KEYS = new Set([
  "scale",
  "alwaysOnTop",
  "reducedMotion",
  "sound",
  "volume",
  "soundSet",
  "bubbleOn",
  "turnCostOn",
  "turnCostDurationMs",
  "clickThrough",
  "snap",
  "hostWindowOnly",
  "hostDock",
  "hostOffsetX",
  "hostOffsetY",
  "easterEggs",
  "bubblePage",
  "manualQuota",
  "manualPercent",
  "manualWeeklyPercent",
]);

function filterAllowed(partial, allowSet) {
  if (!partial || typeof partial !== "object") return {};
  return Object.fromEntries(Object.entries(partial).filter(([key]) => allowSet.has(key)));
}

function defaultSettingsPath() {
  return process.env.DREAM_SKIN_SETTINGS_FILE || path.join(os.homedir(), ".antigravity-dream-skin/settings.json");
}

function defaultWidgetSettingsPath() {
  return process.env.CAT_WIDGET_SETTINGS_FILE || path.join(os.homedir(), ".antigravity-cat-widget/settings.json");
}

function readWebAsset(filename) {
  return fs.readFileSync(path.join(WEB_DIR, filename), "utf8");
}

export async function createStarSuiteService(options = {}) {
  const {
    root,
    skinRoot,
    staged,
    DreamSkinSettings,
    DEFAULT_SETTINGS,
    DreamSkinThemeLoader,
    HostController,
    LocalMediaServer,
    detectMediaKind,
    WidgetSettingsManager,
    DEFAULT_WIDGET_SETTINGS,
    ALLOWED_SOUND_SETS,
  } = loadDreamSkinModules(__dirname);

  const settings = new DreamSkinSettings(options.settingsFile || defaultSettingsPath());
  const widgetSettings = WidgetSettingsManager
    ? new WidgetSettingsManager(options.widgetSettingsFile || defaultWidgetSettingsPath())
    : null;
  const mediaServer = new LocalMediaServer();
  await mediaServer.start();

  const syncAllowedMedia = () => {
    const s = settings.getAll();
    const candidates = [s.customMediaPath, ...(s.recentMedia || [])].filter(Boolean);
    mediaServer.setAllowedFiles(candidates);
  };
  syncAllowedMedia();

  const loader = new DreamSkinThemeLoader({ rootDir: skinRoot, mediaServer });
  const pickMedia = options.pickMedia || pickLocalMediaFile;
  const widgetSupervisor =
    options.widgetSupervisor ||
    new WidgetSupervisor({
      repoRoot: root,
      getConfiguredPath: () => process.env.ANTIGRAVITY_STAR_WIDGET_PATH || "",
      getHideTray: () => settings.get("widgetHideTray") !== false,
    });

  const instanceOwner = options.owner || `antigravity-star-suite-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

  const controller = new HostController(
    loader,
    () => {
      if (typeof options.onStatus === "function") {
        options.onStatus(snapshot());
      }
    },
    {
      owner: instanceOwner,
      discover: options.discover,
      createClient: options.createClient,
      onHostPatch: (patch) => {
        const clean = filterAllowed(patch, ALLOWED_SETTINGS_KEYS);
        if (Object.keys(clean).length > 0) {
          settings.update(clean);
          if (typeof options.onStatus === "function") {
            options.onStatus(snapshot());
          }
        }
      },
    }
  );

  let pollTimer = null;
  let widgetActionError = "";

  const inspectActiveMedia = (s) => {
    try {
      const inspected = loader.inspectActiveMedia(s);
      return {
        mediaKind: inspected.mediaKind,
        mediaName: inspected.mediaName,
        mediaPath: s.mediaType === "preset" ? "" : inspected.mediaPath,
        mediaUrl: inspected.mediaUrl || "./preset-wallpaper.png",
        wallpaperError: null,
      };
    } catch (error) {
      return {
        mediaKind: s.mediaType === "video" ? "video" : "image",
        mediaName: s.customMediaPath ? path.basename(s.customMediaPath) : "背景未就绪",
        mediaPath: s.customMediaPath || "",
        mediaUrl: "./preset-wallpaper.png",
        wallpaperError: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const buildRecentItems = (s) =>
    (s.recentMedia || []).map((filePath) => ({
      path: filePath,
      name: path.basename(filePath),
      kind: detectMediaKind(filePath) || "image",
      exists: fs.existsSync(filePath),
    }));

  const snapshot = () => {
    const s = settings.getAll();
    const activeMedia = inspectActiveMedia(s);
    const widget = widgetSupervisor.status();
    if (widgetActionError && !widget.error) {
      widget.error = widgetActionError;
    }
    return {
      settings: s,
      defaults: DEFAULT_SETTINGS,
      status: controller.status,
      wallpaper: activeMedia.mediaName,
      wallpaperError: activeMedia.wallpaperError,
      activeMedia,
      recentItems: buildRecentItems(s),
      mediaServerUrl: mediaServer.baseUrl,
      widget,
      widgetSettings: widgetSettings ? widgetSettings.getAll() : DEFAULT_WIDGET_SETTINGS || {},
      widgetDefaults: { ...(DEFAULT_WIDGET_SETTINGS || {}), soundSets: ALLOWED_SOUND_SETS },
      staged,
    };
  };

  const updateSettings = async (partial) => {
    const allowed = filterAllowed(partial, ALLOWED_SETTINGS_KEYS);
    settings.update(allowed);
    syncAllowedMedia();
    await controller.update(settings.getAll());
    return snapshot();
  };

  const updateWidgetSettings = async (partial, { extraFlag = "" } = {}) => {
    const allowed = filterAllowed(partial, ALLOWED_WIDGET_KEYS);
    if (widgetSettings && Object.keys(allowed).length > 0) {
      widgetSettings.update(allowed);
    }
    await widgetSupervisor.reloadSettings?.({
      hideTray: settings.get("widgetHideTray") !== false,
      extraFlag,
    });
    return snapshot();
  };

  const applySelectedMediaPath = async (rawPath, { enableIfSelected = true } = {}) => {
    const trimmed = typeof rawPath === "string" ? rawPath.trim() : "";
    if (!trimmed) {
      throw new Error("媒体路径不能为空");
    }
    const kind = detectMediaKind(trimmed);
    if (!kind) {
      throw new Error("不支持的背景格式，请选择 MP4 / WEBM / PNG / JPG / WEBP / GIF");
    }
    const resolved = path.resolve(trimmed);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`找不到背景文件：${path.basename(resolved)}`);
    }
    const prev = settings.getAll();
    const recentMedia = [resolved, ...(prev.recentMedia || [])];
    const patch = {
      mediaType: kind,
      customMediaPath: resolved,
      recentMedia,
    };
    if (enableIfSelected) {
      patch.enabled = true;
    }
    if (kind === "video") {
      patch.videoPaused = false;
    }
    return updateSettings(patch);
  };

  const selectPreset = async () => updateSettings({ mediaType: "preset" });

  const pickAndApplyMedia = async () => {
    const pickedPath = await pickMedia();
    if (!pickedPath) {
      return { picked: false, canceled: true, state: snapshot() };
    }
    const state = await applySelectedMediaPath(pickedPath, { enableIfSelected: true });
    return { picked: true, filePath: pickedPath, state };
  };

  const refresh = async () => {
    syncAllowedMedia();
    await controller.tick();
    return snapshot();
  };

  const handleWidgetAction = async (action, value) => {
    widgetActionError = "";
    const hideTray = settings.get("widgetHideTray") !== false;
    let result;
    if (action === "start") {
      result = await widgetSupervisor.ensureStarted({ silent: false, hideTray });
    } else if (action === "recall") {
      result = await widgetSupervisor.recall({ hideTray });
    } else if (action === "restart") {
      result = await (widgetSupervisor.restart
        ? widgetSupervisor.restart({ silent: true, hideTray })
        : widgetSupervisor.ensureStarted({ silent: true, hideTray }));
    } else if (action === "quit") {
      result = widgetSupervisor.quit();
    } else if (action === "dock-left") {
      if (widgetSettings) widgetSettings.update({ hostDock: "left", hostOffsetY: 0 });
      result = await widgetSupervisor.reloadSettings?.({ hideTray, extraFlag: "--dock-left" });
    } else if (action === "dock-right") {
      if (widgetSettings) widgetSettings.update({ hostDock: "right", hostOffsetX: 0, hostOffsetY: 0 });
      result = await widgetSupervisor.reloadSettings?.({ hideTray, extraFlag: "--dock-right" });
    } else if (action === "reset-pos") {
      if (widgetSettings) widgetSettings.update({ hostDock: "", hostOffsetX: 18, hostOffsetY: 18 });
      result = await widgetSupervisor.reloadSettings?.({ hideTray, extraFlag: "--reset-pos" });
    } else if (action === "autoLaunch") {
      settings.update({ widgetAutoLaunch: Boolean(value) });
      result = { ok: true, widgetAutoLaunch: settings.get("widgetAutoLaunch") };
    } else if (action === "hideTray") {
      const nextHide = Boolean(value);
      settings.update({ widgetHideTray: nextHide });
      if (widgetSupervisor.status().running) {
        result = await (widgetSupervisor.restart
          ? widgetSupervisor.restart({ silent: true, hideTray: nextHide })
          : { ok: true });
      } else {
        result = { ok: true, widgetHideTray: nextHide };
      }
    } else {
      throw new Error(`未知桌宠操作：${action}`);
    }
    if (result && result.ok === false && result.reason) {
      widgetActionError = result.reason;
    }
    return { result, state: snapshot() };
  };

  const readPresetPngBuffer = () => {
    const m = loader.verifyIntegrity();
    return fs.readFileSync(m.file);
  };

  const start = async () => {
    await mediaServer.start();
    syncAllowedMedia();
    await controller.update(settings.getAll());
    if (options.autoStartWidget !== false && settings.get("widgetAutoLaunch")) {
      await widgetSupervisor.ensureStarted({
        silent: true,
        hideTray: settings.get("widgetHideTray") !== false,
      });
    }
    if (options.autoTick !== false) {
      const intervalMs = Number.isFinite(options.pollIntervalMs) ? options.pollIntervalMs : 4000;
      pollTimer = setInterval(() => {
        controller.tick().catch(() => {});
      }, intervalMs);
      pollTimer.unref?.();
    }
    return snapshot();
  };

  const stop = async () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    await controller.stop();
    await mediaServer.stop();
  };

  return {
    root,
    skinRoot,
    staged,
    settings,
    loader,
    controller,
    mediaServer,
    widgetSupervisor,
    snapshot,
    updateSettings,
    updateWidgetSettings,
    applySelectedMediaPath,
    selectPreset,
    pickAndApplyMedia,
    refresh,
    handleWidgetAction,
    readPresetPngBuffer,
    start,
    stop,
  };
}

function readJsonRequestBody(req) {
  if (req && typeof req.body === "object" && req.body !== null) {
    return Promise.resolve(req.body);
  }
  if (typeof req?.body === "string") {
    try {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {});
    } catch {
      return Promise.reject(new Error("Invalid JSON body"));
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function buildRouteHandlers(service) {
  return {
    pages: [
      { path: "/", contentType: "text/html; charset=utf-8", read: () => readWebAsset("index.html") },
      { path: "/styles.css", contentType: "text/css; charset=utf-8", read: () => readWebAsset("styles.css") },
      { path: "/app.js", contentType: "application/javascript; charset=utf-8", read: () => readWebAsset("app.js") },
      { path: "/preset-wallpaper.png", contentType: "image/png", read: () => service.readPresetPngBuffer() },
    ],
    apis: [
      {
        method: "GET",
        path: "/api/state",
        handle: async () => ({ status: 200, data: service.snapshot() }),
      },
      {
        method: "POST",
        path: "/api/settings",
        handle: async (body) => ({ status: 200, data: await service.updateSettings(body) }),
      },
      {
        method: "POST",
        path: "/api/pick-media",
        handle: async () => ({ status: 200, data: await service.pickAndApplyMedia() }),
      },
      {
        method: "POST",
        path: "/api/select-media",
        handle: async (body) => {
          if (body?.mediaType === "preset") {
            return { status: 200, data: await service.selectPreset() };
          }
          return {
            status: 200,
            data: await service.applySelectedMediaPath(body?.path, {
              enableIfSelected: body?.enable !== false,
            }),
          };
        },
      },
      {
        method: "POST",
        path: "/api/refresh",
        handle: async () => ({ status: 200, data: await service.refresh() }),
      },
      {
        method: "POST",
        path: "/api/widget",
        handle: async (body) => ({
          status: 200,
          data: await service.handleWidgetAction(body?.action, body?.value),
        }),
      },
      {
        method: "POST",
        path: "/api/widget-settings",
        handle: async (body) => ({
          status: 200,
          data: await service.updateWidgetSettings(body),
        }),
      },
    ],
  };
}

export async function startStandaloneHttpServer(service, { port = 0, host = "127.0.0.1" } = {}) {
  const routes = buildRouteHandlers(service);
  const pageMap = new Map(routes.pages.map((p) => [p.path, p]));
  const apiMap = new Map(routes.apis.map((a) => [`${a.method}:${a.path}`, a]));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);
    if (req.method === "GET" && url.pathname === "/preload.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end("window.sidecar = window.sidecar || null;");
      return;
    }

    if (req.method === "GET" && pageMap.has(url.pathname)) {
      const page = pageMap.get(url.pathname);
      try {
        const body = page.read();
        res.writeHead(200, { "Content-Type": page.contentType, "Cache-Control": "no-store" });
        res.end(body);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    const api = apiMap.get(`${req.method}:${url.pathname}`);
    if (!api) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    try {
      const body = req.method === "POST" ? await readJsonRequestBody(req) : {};
      const result = await api.handle(body);
      res.writeHead(result.status || 200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(result.data));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = addr && typeof addr === "object" ? addr.port : port;
  return {
    server,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function runSidecarRuntime() {
  const service = await createStarSuiteService();
  await service.start();
  const routes = buildRouteHandlers(service);

  let closeHttp = null;
  if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
    const { SidecarApp, Response } = await loadSidecarSdk();
    const app = new SidecarApp();

    for (const page of routes.pages) {
      app.page(page.path, () => new Response(page.read(), { contentType: page.contentType }));
    }

    for (const api of routes.apis) {
      app.api(
        api.path,
        async (data) => {
          try {
            // SidecarApp passes the parsed JSON body object directly for POST handlers
            const body = api.method === "POST" && data && typeof data === "object" ? data : {};
            const result = await api.handle(body);
            return new Response(JSON.stringify(result.data), {
              status: result.status || 200,
              contentType: "application/json; charset=utf-8",
            });
          } catch (error) {
            return new Response(
              JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
              { status: 400, contentType: "application/json; charset=utf-8" }
            );
          }
        },
        api.method
      );
    }

    const sdkServer = await app.run();
    closeHttp = () =>
      new Promise((resolve) => {
        if (sdkServer && typeof sdkServer.close === "function") {
          sdkServer.close(() => resolve());
        } else {
          resolve();
        }
      });
  } else {
    const previewPort = Number(process.env.STAR_SUITE_PREVIEW_PORT || 0);
    const standalone = await startStandaloneHttpServer(service, { port: previewPort });
    closeHttp = standalone.close;
    console.log(`[star-suite] standalone panel preview running at ${standalone.url}`);
  }

  let watchdogTimer = null;
  let lockFile = "";
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (watchdogTimer) clearInterval(watchdogTimer);
    if (lockFile) {
      try {
        const cur = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        if (cur && cur.pid === process.pid) fs.unlinkSync(lockFile);
      } catch {}
    }
    try {
      if (closeHttp) await closeHttp();
    } catch {}
    try {
      await service.stop();
    } catch {}
    process.exit(0);
  };

  if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
    const lockDir = path.join(os.homedir(), ".antigravity-dream-skin");
    lockFile = path.join(lockDir, "star-suite-sidecar.pid.json");
    try {
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, ppid: process.ppid, startedAt: Date.now() }), "utf8");
    } catch {}

    const isPidAlive = (pid) => {
      if (!pid || pid <= 1) return true;
      try {
        process.kill(pid, 0);
        return true;
      } catch (err) {
        return err && err.code === "EPERM";
      }
    };

    let grandparentPid = 0;
    if (process.platform === "win32" && process.ppid > 1) {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId=${process.ppid}').ParentProcessId`],
        { encoding: "utf8", windowsHide: true, timeout: 5000 },
        (err, stdout) => {
          if (!err) {
            const parsed = Number(String(stdout || "").trim());
            if (Number.isInteger(parsed) && parsed > 1) grandparentPid = parsed;
          }
        }
      );
    }

    watchdogTimer = setInterval(() => {
      if (!isPidAlive(process.ppid) || (grandparentPid > 1 && !isPidAlive(grandparentPid))) {
        shutdown();
        return;
      }
      try {
        const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        if (lock && typeof lock.pid === "number" && lock.pid !== process.pid && isPidAlive(lock.pid)) {
          shutdown();
        }
      } catch {}
    }, 4000);
    watchdogTimer.unref?.();
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  runSidecarRuntime().catch((error) => {
    console.error("[star-suite] fatal startup error:", error);
    process.exit(1);
  });
}
