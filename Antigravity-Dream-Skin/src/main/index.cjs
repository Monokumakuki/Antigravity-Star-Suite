const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { DreamSkinSettings, DEFAULT_SETTINGS } = require("../domain/settings.cjs");
const { DreamSkinThemeLoader } = require("../domain/theme-loader.cjs");
const { HostController } = require("../domain/host-controller.cjs");
const { LocalMediaServer, detectMediaKind } = require("../domain/media-server.cjs");

const SAVEABLE_KEYS = [
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
];

const dataDir =
  process.argv.find((a) => a.startsWith("--data-dir="))?.slice(11) ||
  path.join(os.homedir(), ".antigravity-dream-skin");
app.setPath("userData", path.join(dataDir, "runtime"));
app.setName("Gemini · Dream Skin");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else if (process.argv.includes("--quit")) {
  app.quit();
} else {
  let win;
  let tray;
  let quitting = false;

  const settings = new DreamSkinSettings(path.join(dataDir, "settings.json"));
  const mediaServer = new LocalMediaServer();
  const syncAllowedMedia = () => {
    const s = settings.getAll();
    mediaServer.setAllowedFiles([s.customMediaPath, ...(s.recentMedia || [])].filter(Boolean));
  };
  const loader = new DreamSkinThemeLoader({ mediaServer });

  if (process.argv.includes("--enable")) settings.update({ enabled: true });
  if (process.argv.includes("--disable")) settings.update({ enabled: false });

  const controller = new HostController(loader, () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("dream:state", snapshot());
    }
  });

  function snapshot() {
    const s = settings.getAll();
    let wallpaper = null;
    let wallpaperError = null;
    let activeMedia = {
      mediaKind: s.mediaType === "video" ? "video" : "image",
      mediaName: s.customMediaPath ? path.basename(s.customMediaPath) : "Gemini Character Sheet",
      mediaPath: s.mediaType === "preset" ? "" : s.customMediaPath || "",
      mediaUrl: "",
    };
    try {
      const inspected = loader.inspectActiveMedia(s);
      wallpaper = inspected.mediaName;
      activeMedia = {
        mediaKind: inspected.mediaKind,
        mediaName: inspected.mediaName,
        mediaPath: s.mediaType === "preset" ? "" : inspected.mediaPath,
        mediaUrl: inspected.mediaUrl || "",
      };
    } catch (error) {
      wallpaperError = error instanceof Error ? error.message : String(error);
    }
    const recentItems = (s.recentMedia || []).map((filePath) => ({
      path: filePath,
      name: path.basename(filePath),
      kind: detectMediaKind(filePath) || "image",
      exists: fs.existsSync(filePath),
    }));
    return {
      settings: s,
      defaults: DEFAULT_SETTINGS,
      status: controller.status,
      wallpaper,
      wallpaperError,
      activeMedia,
      recentItems,
    };
  }

  async function applyCustomMediaPath(filePath) {
    const kind = detectMediaKind(filePath);
    if (!kind) {
      throw new Error("不支持的背景格式，请选择 MP4 / WEBM / PNG / JPG / WEBP / GIF");
    }
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error("背景文件不存在：" + path.basename(resolved));
    }
    const prev = settings.getAll();
    settings.update({
      mediaType: kind,
      customMediaPath: resolved,
      recentMedia: [resolved, ...(prev.recentMedia || [])],
      enabled: true,
      ...(kind === "video" ? { videoPaused: false } : {}),
    });
    syncAllowedMedia();
    await controller.update(settings.getAll());
    return snapshot();
  }

  function show() {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      return;
    }
    win = new BrowserWindow({
      width: 1240,
      height: 850,
      minWidth: 880,
      minHeight: 650,
      autoHideMenuBar: true,
      title: "Gemini · Dream Skin",
      backgroundColor: "#f6f3fb",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.on("close", (e) => {
      if (!quitting && settings.get("enabled")) {
        e.preventDefault();
        win.hide();
      }
    });
    win.on("closed", () => {
      win = null;
      if (!settings.get("enabled")) app.quit();
    });
  }

  const trusted = (e) => win && !win.isDestroyed() && e.sender === win.webContents;

  ipcMain.handle("dream:get", (e) => (trusted(e) ? snapshot() : null));
  ipcMain.handle("dream:save", async (e, partial) => {
    if (!trusted(e)) return null;
    const allowed = Object.fromEntries(
      Object.entries(partial || {}).filter(([k]) => SAVEABLE_KEYS.includes(k))
    );
    settings.update(allowed);
    syncAllowedMedia();
    await controller.update(settings.getAll());
    return snapshot();
  });
  ipcMain.handle("dream:refresh", async (e) => {
    if (!trusted(e)) return null;
    syncAllowedMedia();
    await controller.tick();
    return snapshot();
  });
  ipcMain.handle("dream:pickMedia", async (e) => {
    if (!trusted(e)) return null;
    const res = await dialog.showOpenDialog(win, {
      title: "选择背景图片或 MP4 视频",
      properties: ["openFile"],
      filters: [
        { name: "图片与视频", extensions: ["mp4", "webm", "png", "jpg", "jpeg", "webp", "gif"] },
        { name: "视频", extensions: ["mp4", "webm"] },
        { name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) {
      return { picked: false, state: snapshot() };
    }
    const state = await applyCustomMediaPath(res.filePaths[0]);
    return { picked: true, state };
  });
  ipcMain.handle("dream:selectMediaPath", async (e, filePath) => {
    if (!trusted(e)) return null;
    return applyCustomMediaPath(filePath);
  });
  ipcMain.handle("dream:selectPreset", async (e) => {
    if (!trusted(e)) return null;
    settings.update({ mediaType: "preset" });
    syncAllowedMedia();
    await controller.update(settings.getAll());
    return snapshot();
  });
  ipcMain.on("dream:quit", (e) => {
    if (trusted(e)) app.quit();
  });

  app.on("second-instance", (_event, args) => {
    if (args.includes("--quit")) {
      app.quit();
      return;
    }
    if (args.includes("--enable") || args.includes("--disable")) {
      settings.update({ enabled: args.includes("--enable") });
      controller.update(settings.getAll());
    }
    if (!args.includes("--background")) show();
  });

  app.whenReady().then(async () => {
    await mediaServer.start();
    syncAllowedMedia();
    if (!process.argv.includes("--background")) show();
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "../../assets/app-icon.ico")));
    tray.setToolTip("Dream Skin");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开皮肤设置", click: show },
        {
          label: "关闭皮肤并恢复原样",
          click: async () => {
            settings.update({ enabled: false });
            await controller.update(settings.getAll());
          },
        },
        { type: "separator" },
        { label: "退出并恢复原样", click: () => app.quit() },
      ])
    );
    tray.on("double-click", show);
    controller.start(settings.getAll());
  });

  app.on("before-quit", (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    Promise.allSettled([controller.stop(), mediaServer.stop()]).finally(() => {
      tray?.destroy();
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (!settings.get("enabled")) app.quit();
  });
}
