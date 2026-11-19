const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const SUPPORTED_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const SUPPORTED_VIDEO_EXTS = new Set([".mp4", ".webm"]);

function detectMediaKind(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) return null;
  const ext = path.extname(filePath.trim()).toLowerCase();
  if (SUPPORTED_IMAGE_EXTS.has(ext)) return "image";
  if (SUPPORTED_VIDEO_EXTS.has(ext)) return "video";
  return null;
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function parseByteRange(rangeHeader, totalSize) {
  if (typeof rangeHeader !== "string" || !rangeHeader.startsWith("bytes=")) return null;
  if (!Number.isInteger(totalSize) || totalSize <= 0) return { invalid: true };
  const spec = rangeHeader.slice(6).split(",")[0].trim();
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match || (!match[1] && !match[2])) return { invalid: true };
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalSize - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= totalSize) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, totalSize - 1), invalid: false };
}

function normalizeKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

class LocalMediaServer {
  constructor() {
    this.token = crypto.randomBytes(16).toString("hex");
    this.allowed = new Map();
    this.server = null;
    this.port = 0;
  }

  get baseUrl() {
    if (!this.port) return "";
    return `http://127.0.0.1:${this.port}`;
  }

  register(filePath) {
    const resolved = path.resolve(filePath);
    if (!detectMediaKind(resolved)) {
      throw new Error(`不支持的媒体格式：${path.basename(resolved)}`);
    }
    this.allowed.set(normalizeKey(resolved), resolved);
    if (!this.port) return "";
    return `${this.baseUrl}/media?token=${this.token}&path=${encodeURIComponent(resolved)}`;
  }

  setAllowedFiles(paths) {
    this.allowed.clear();
    for (const item of paths || []) {
      if (typeof item === "string" && item.trim() && detectMediaKind(item)) {
        const resolved = path.resolve(item.trim());
        this.allowed.set(normalizeKey(resolved), resolved);
      }
    }
  }

  start() {
    if (this.server) return Promise.resolve(this.baseUrl);
    this.server = http.createServer((req, res) => this.#handle(req, res));
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.removeListener("error", reject);
        const addr = this.server.address();
        this.port = addr && typeof addr === "object" ? addr.port : 0;
        resolve(this.baseUrl);
      });
    });
  }

  stop() {
    if (!this.server) return Promise.resolve();
    const srv = this.server;
    this.server = null;
    this.port = 0;
    return new Promise((resolve) => srv.close(() => resolve()));
  }

  #pipeFile(approved, res, range) {
    // Use 256 KB sequential chunks so 4K 60fps streams sustain bitrate with fewer syscalls
    const streamOpts = range
      ? { start: range.start, end: range.end, highWaterMark: 262144 }
      : { highWaterMark: 262144 };
    const stream = fs.createReadStream(approved, streamOpts);
    const cleanup = () => {
      if (!stream.destroyed) stream.destroy();
    };
    res.on("close", cleanup);
    stream.on("error", () => {
      if (!res.destroyed) res.destroy();
    });
    stream.pipe(res);
  }

  #handle(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/media") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (url.searchParams.get("token") !== this.token) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    const reqPath = url.searchParams.get("path") || "";
    const approved = reqPath ? this.allowed.get(normalizeKey(reqPath)) : null;
    if (!approved) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let stat;
    try {
      stat = fs.statSync(approved);
      if (!stat.isFile()) throw new Error("not-a-file");
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const contentType = mimeTypeForPath(approved);
    const total = stat.size;
    const etag = `W/"${total}-${Math.trunc(stat.mtimeMs)}"`;
    // Private short cache lets Chromium reuse buffered media blocks on loop boundaries without exposing public proxies
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("ETag", etag);
    const rangeHeader = req.headers.range;
    if (!rangeHeader && req.headers["if-none-match"] === etag) {
      res.writeHead(304, { "Accept-Ranges": "bytes", ETag: etag });
      res.end();
      return;
    }
    if (rangeHeader) {
      const parsed = parseByteRange(rangeHeader, total);
      if (!parsed || parsed.invalid) {
        res.writeHead(416, { "Content-Range": `bytes */${total}` });
        res.end();
        return;
      }
      const chunkLen = parsed.end - parsed.start + 1;
      res.writeHead(206, {
        "Content-Type": contentType,
        "Content-Range": `bytes ${parsed.start}-${parsed.end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkLen,
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      this.#pipeFile(approved, res, parsed);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": total,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    this.#pipeFile(approved, res, null);
  }
}

module.exports = {
  SUPPORTED_IMAGE_EXTS,
  SUPPORTED_VIDEO_EXTS,
  detectMediaKind,
  mimeTypeForPath,
  parseByteRange,
  LocalMediaServer,
};
