const { discover, Cdp } = require("../../../shared/host.cjs");
const { installTheme } = require("../host/theme.cjs");
class HostController {
  constructor(loader, onStatus, options = {}) {
    this.owner = options.owner || require("node:crypto").randomUUID();
    this.loader = loader;
    this.onStatus = onStatus;
    this.onHostPatch = typeof options.onHostPatch === "function" ? options.onHostPatch : null;
    this.discover = options.discover || discover;
    this.createClient = options.createClient || (url => new Cdp(url));
    this.client = null;
    this.settings = { enabled: false };
    this.status = { connected: false, applied: false, message: "等待连接 Antigravity" };
    this.signature = null;
    this.revision = 0;
  }
  report(value) {
    this.status = { ...this.status, ...value };
    try { this.onStatus(this.status); } catch (error) {
      console.warn("皮肤状态通知失败：", error.message);
    }
  }
  tick() {
    if (this.stopping) return Promise.resolve();
    if (!this.inflight) {
      this.inflight = this.drain().finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }
  async drain() {
    let revision;
    do {
      revision = this.revision;
      await this.runTick(revision);
    } while (!this.stopping && revision !== this.revision);
  }
  async runTick(revision) {
    const settings = { ...this.settings };
    try {
      if (!this.client || this.client.closed) {
        const found = await this.discover();
        if (!found) {
          this.report({ connected: false, applied: false, message: "请先打开 Antigravity，检测到后自动连接" });
          return;
        }
        this.client = this.createClient(found.target.webSocketDebuggerUrl);
        this.signature = null;
      }
      const current = await this.client.evaluate(
        "({ready:document.readyState,themed:!!window.__agyDreamSkinV2?.status().applied,owner:window.__agyDreamSkinV2?.owner,rev:window.__agyDreamSkinV2?.rev||0,stale:typeof window.__agyDreamSkinV2?.lastSeen==='number'&&(Date.now()-window.__agyDreamSkinV2.lastSeen>15000),chatWidth:window.__agyDreamSkinV2?.consumeChatWidth?.()??null})"
      );
      if (revision !== this.revision || this.stopping) return;
      if (!settings.enabled) {
        if (current.themed && (current.owner === this.owner || current.stale)) {
          await this.client.evaluate("window.__agyDreamSkinV2?.destroy()");
        }
        this.signature = null;
        this.report({
          connected: true, applied: false,
          message: current.themed && current.owner !== this.owner && !current.stale
            ? "已连接 · 当前实例未启用，另一个皮肤实例正在运行"
            : "已连接 · 皮肤已关闭，宿主恢复原样"
        });
        return;
      }
      const canUpgradeLegacy =
        current.themed &&
        current.owner !== this.owner &&
        !current.stale &&
        typeof current.rev === "number" &&
        current.rev > 0 &&
        current.rev < 12 &&
        current.owner === "antigravity-star-suite-plugin";
      if (current.themed && current.owner !== this.owner && !current.stale && !canUpgradeLegacy) {
        this.report({ connected: true, applied: false, message: "已连接 · 皮肤由另一个运行实例管理" });
        return;
      }
      if (current.themed && (current.stale || current.owner !== this.owner)) {
        await this.client.evaluate("window.__agyDreamSkinV2?.destroy()");
        this.signature = null;
      }
      let effectiveSettings = settings;
      if (
        current.themed &&
        current.owner === this.owner &&
        typeof current.chatWidth === "number" &&
        current.chatWidth !== effectiveSettings.chatWidth
      ) {
        effectiveSettings = { ...effectiveSettings, chatWidth: current.chatWidth };
        this.settings = { ...this.settings, chatWidth: current.chatWidth };
        this.signature = JSON.stringify(effectiveSettings);
        if (this.onHostPatch) {
          try {
            await this.onHostPatch({ chatWidth: current.chatWidth });
          } catch {}
        }
      }
      const signature = JSON.stringify(effectiveSettings);
      if (!current.themed || current.stale || current.rev !== 12 || signature !== this.signature) {
        const payload = { ...this.loader.payload(effectiveSettings), owner: this.owner };
        const result = await this.client.evaluate("(" + installTheme.toString() + ")(" + JSON.stringify(payload) + ")");
        this.signature = signature;
        this.report({
          connected: true, ...result,
          message: result.applied ? "已应用到真实 Antigravity · 可随时关闭" : "宿主布局已变化，等待重新应用"
        });
      } else if (current.owner === this.owner) {
        await this.client.evaluate("window.__agyDreamSkinV2?.touch?.()");
      }
    } catch (error) {
      this.client?.close();
      this.client = null;
      this.signature = null;
      this.report({ connected: false, applied: false, message: "暂未接入：" + error.message });
    }
  }
  start(settings) {
    clearInterval(this.timer);
    this.stopping = false;
    this.update(settings);
    this.timer = setInterval(() => this.tick(), 2500);
  }
  update(settings) {
    this.settings = { ...settings };
    this.revision++;
    return this.tick();
  }
  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    try { await this.inflight; } catch {}
    try {
      if (this.client && !this.client.closed) {
        await this.client.evaluate("window.__agyDreamSkinV2?.owner===" + JSON.stringify(this.owner) + " ? window.__agyDreamSkinV2.destroy() : null");
      }
    } catch {}
    this.client?.close();
  }
}
module.exports = { HostController };
