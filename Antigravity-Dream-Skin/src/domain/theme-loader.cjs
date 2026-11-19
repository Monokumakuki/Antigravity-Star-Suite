const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { detectMediaKind, mimeTypeForPath } = require("./media-server.cjs");
const { DEFAULT_GLASS, DEFAULT_FONT } = require("./settings.cjs");

class DreamSkinThemeLoader {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.resolve(__dirname, "../..");
    this.mediaServer = options.mediaServer || null;
    this.wallpaperPackDir = path.join(this.rootDir, "assets/wallpapers/gemini-character-sheet-v1");
    try {
      this.manifest = JSON.parse(
        fs.readFileSync(path.join(this.wallpaperPackDir, "manifest.json"), "utf8")
      );
    } catch {
      this.manifest = null;
    }
  }

  verifyIntegrity() {
    if (!this.manifest) {
      try {
        this.manifest = JSON.parse(
          fs.readFileSync(path.join(this.wallpaperPackDir, "manifest.json"), "utf8")
        );
      } catch {
        throw new Error("壁纸清单缺失或损坏，请恢复完整资源包");
      }
    }
    if (!this.manifest || typeof this.manifest.file !== "string") {
      throw new Error("无效壁纸路径");
    }
    const p = path.resolve(this.wallpaperPackDir, this.manifest.file);
    if (!p.startsWith(this.wallpaperPackDir + path.sep) || path.extname(p) !== ".png") {
      throw new Error("无效壁纸路径");
    }
    let b;
    try {
      b = fs.readFileSync(p);
    } catch {
      throw new Error("壁纸图片无法读取，请恢复完整资源包");
    }
    const hash = crypto.createHash("sha256").update(b).digest("hex");
    if (hash !== this.manifest.sha256) {
      throw new Error("壁纸校验失败，原文件可能被更改");
    }
    return { ...this.manifest, file: p, verified: true };
  }

  resolveCustomMedia(settings) {
    const rawPath = typeof settings?.customMediaPath === "string" ? settings.customMediaPath.trim() : "";
    if (!rawPath) {
      throw new Error("尚未选择自定义图片或 MP4 文件");
    }
    const kind = detectMediaKind(rawPath);
    if (!kind) {
      throw new Error("不支持的背景格式，请选择 MP4 / WEBM / PNG / JPG / WEBP / GIF");
    }
    const resolved = path.resolve(rawPath);
    let stat;
    try {
      stat = fs.statSync(resolved);
      if (!stat.isFile()) throw new Error("not-file");
    } catch {
      throw new Error("自定义背景文件不存在或无法读取：" + path.basename(resolved));
    }

    const mediaUrl = this.mediaServer
      ? this.mediaServer.register(resolved)
      : kind === "image"
        ? `data:${mimeTypeForPath(resolved)};base64,${fs.readFileSync(resolved).toString("base64")}`
        : "";
    if (!mediaUrl) {
      throw new Error("视频背景需要启用本地流媒体服务");
    }
    return {
      mediaKind: kind,
      mediaUrl,
      mediaName: path.basename(resolved),
      mediaPath: resolved,
      fileSize: stat.size,
    };
  }

  inspectActiveMedia(settings) {
    const mode = settings?.mediaType || "preset";
    if ((mode === "image" || mode === "video") && settings?.customMediaPath) {
      return this.resolveCustomMedia(settings);
    }
    const m = this.verifyIntegrity();
    return {
      mediaKind: "image",
      mediaName: m.name || "Gemini Character Sheet",
      mediaPath: m.file,
      manifest: m,
    };
  }

  payload(settings = {}) {
    const base = {
      version: 2,
      outputMode: settings.outputMode === "glass" ? "glass" : "transparent",
      positionX: Math.max(0, Math.min(100, settings.positionX ?? 50)),
      positionY: Math.max(0, Math.min(100, settings.positionY ?? 50)),
      zoom: Math.max(1, Math.min(2, settings.zoom ?? 1)),
      opacity: Math.max(0, Math.min(100, settings.opacity ?? 55)) / 100,
      fit: ["cover", "contain", "adaptive"].includes(settings.fit) ? settings.fit : "adaptive",
      scrim: Math.max(0, Math.min(60, settings.scrim ?? 12)) / 100,
      videoMuted: settings.videoMuted !== false,
      videoPlaybackRate: Math.max(0.25, Math.min(2, settings.videoPlaybackRate ?? 1)),
      videoPaused: Boolean(settings.videoPaused),
      videoSmoothMode: settings.videoSmoothMode !== false,
      chatWidth: (() => {
        const w = Math.round(Number(settings.chatWidth) || 0);
        return w > 0 ? Math.max(45, Math.min(100, w)) : 0;
      })(),
      glass: settings.glass || DEFAULT_GLASS,
      font: settings.font || DEFAULT_FONT,
    };

    const mode = settings.mediaType || "preset";
    if ((mode === "image" || mode === "video") && settings.customMediaPath) {
      const custom = this.resolveCustomMedia(settings);
      return {
        ...base,
        mediaKind: custom.mediaKind,
        mediaUrl: custom.mediaUrl,
        mediaName: custom.mediaName,
      };
    }

    const m = this.verifyIntegrity();
    return {
      ...base,
      mediaKind: "image",
      mediaName: m.name || "Gemini Character Sheet",
      image: "data:image/png;base64," + fs.readFileSync(m.file).toString("base64"),
    };
  }
}

module.exports = { DreamSkinThemeLoader };
