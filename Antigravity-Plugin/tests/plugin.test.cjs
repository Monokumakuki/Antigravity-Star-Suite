const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pluginRoot = path.resolve(__dirname, "..");

test("plugin manifest and sidecar manifest conform to Antigravity native plugin layout", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "plugin.json"), "utf8"));
  assert.equal(manifest.name, "antigravity-star-suite");
  const sidecar = JSON.parse(
    fs.readFileSync(path.join(pluginRoot, "sidecars/star-suite/sidecar.json"), "utf8")
  );
  assert.equal(sidecar.command, "node");
  assert.deepEqual(sidecar.args, ["main.mjs"]);
  assert.equal(sidecar.restart_policy, "always");
  assert.equal(sidecar.has_web_ui, true);
  assert.equal(sidecar.ui_config.views[0].entrypoint, "SIDECAR_UI_ENTRYPOINT_AUX_PANE");
});

test("widget supervisor sanitizes ELECTRON_RUN_AS_NODE and locates installed executable", async () => {
  const { buildWidgetSpawnEnv, resolveWidgetTarget } = await import(
    "../sidecars/star-suite/widget-supervisor.mjs"
  );
  const env = buildWidgetSpawnEnv({
    ELECTRON_RUN_AS_NODE: "1",
    PATH: "C:\\Windows",
  });
  assert.equal("ELECTRON_RUN_AS_NODE" in env, false);
  assert.equal(env.PATH, "C:\\Windows");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "star-widget-loc-"));
  const fakeExe = path.join(dir, "StarWidget.exe");
  fs.writeFileSync(fakeExe, "stub");
  const found = resolveWidgetTarget({ configuredPath: fakeExe, localAppData: dir });
  assert.deepEqual(found, { kind: "exe", command: fakeExe, argsPrefix: [], cwd: dir });
});

test("runtime-loader prefers staged ./runtime when present and falls back to source root", async () => {
  const { resolveSuiteRoot } = await import("../sidecars/star-suite/runtime-loader.mjs");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "star-suite-loader-"));
  const unStaged = resolveSuiteRoot(tmpDir);
  assert.equal(unStaged.staged, false);

  fs.mkdirSync(path.join(tmpDir, "runtime/Antigravity-Dream-Skin"), { recursive: true });
  const staged = resolveSuiteRoot(tmpDir);
  assert.equal(staged.staged, true);
  assert.equal(staged.root, path.join(tmpDir, "runtime"));
});

test("sidecar service HTTP endpoints manage Dream Skin MP4/preset switching and widget actions", async (t) => {
  const { createStarSuiteService, startStandaloneHttpServer } = await import(
    "../sidecars/star-suite/main.mjs"
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "star-suite-svc-"));
  const settingsFile = path.join(tmpDir, "settings.json");
  const mp4File = path.join(tmpDir, "loop.mp4");
  fs.writeFileSync(mp4File, Buffer.from("0123456789ABCDEF"));

  const widgetCalls = [];
  let running = false;
  const fakeWidget = {
    ensureStarted(opts) {
      running = true;
      widgetCalls.push(["start", opts]);
      return { ok: true, started: true };
    },
    recall() {
      running = true;
      widgetCalls.push(["recall"]);
      return { ok: true };
    },
    quit() {
      running = false;
      widgetCalls.push(["quit"]);
      return { ok: true };
    },
    status() {
      return {
        available: true,
        kind: "exe",
        path: "C:\\Fake\\StarWidget.exe",
        running,
        managedByPlugin: running,
        error: "",
      };
    },
  };

  const service = await createStarSuiteService({
    settingsFile,
    discover: async () => null,
    pickMedia: async () => mp4File,
    widgetSupervisor: fakeWidget,
    autoTick: false,
    autoStartWidget: false,
  });
  await service.start();
  const httpSrv = await startStandaloneHttpServer(service, { port: 0 });
  t.after(async () => {
    await httpSrv.close();
    await service.stop();
  });

  // 1. Static panel assets respond 200
  const htmlRes = await fetch(`${httpSrv.url}/`);
  assert.equal(htmlRes.status, 200);
  assert.match(await htmlRes.text(), /星语 · Dream Skin/);

  const pngRes = await fetch(`${httpSrv.url}/preset-wallpaper.png`);
  assert.equal(pngRes.status, 200);
  assert.ok((await pngRes.arrayBuffer()).byteLength > 1000);

  // 2. Pick MP4 via /api/pick-media switches mediaType to video and streams via LocalMediaServer
  const pickRes = await fetch(`${httpSrv.url}/api/pick-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(pickRes.status, 200);
  const picked = await pickRes.json();
  assert.equal(picked.picked, true);
  assert.equal(picked.state.settings.mediaType, "video");
  assert.equal(picked.state.settings.customMediaPath, mp4File);
  assert.equal(picked.state.settings.enabled, true);
  assert.equal(picked.state.activeMedia.mediaKind, "video");
  assert.ok(picked.state.activeMedia.mediaUrl.startsWith(service.mediaServer.baseUrl));

  const streamRes = await fetch(picked.state.activeMedia.mediaUrl, {
    headers: { Range: "bytes=4-9" },
  });
  assert.equal(streamRes.status, 206);
  assert.equal(await streamRes.text(), "456789");

  // 3. Switch back to built-in preset
  const presetRes = await fetch(`${httpSrv.url}/api/select-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaType: "preset" }),
  });
  assert.equal(presetRes.status, 200);
  const presetState = await presetRes.json();
  assert.equal(presetState.settings.mediaType, "preset");
  assert.equal(presetState.activeMedia.mediaUrl, "./preset-wallpaper.png");
  assert.equal(presetState.recentItems.length, 1);

  // 4. Widget actions & auto-launch toggle
  const recallRes = await fetch(`${httpSrv.url}/api/widget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "recall" }),
  });
  assert.equal(recallRes.status, 200);
  const recallBody = await recallRes.json();
  assert.equal(recallBody.state.widget.running, true);

  const autoRes = await fetch(`${httpSrv.url}/api/widget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "autoLaunch", value: false }),
  });
  assert.equal(autoRes.status, 200);
  const autoBody = await autoRes.json();
  assert.equal(autoBody.state.settings.widgetAutoLaunch, false);
  assert.deepEqual(widgetCalls, [["recall"]]);
});

test("installStarSuitePlugin stages self-contained runtime and enables plugin in config.json", async () => {
  const { installStarSuitePlugin } = await import("../../tools/install-plugin.mjs");
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "star-suite-install-"));
  const targetDir = path.join(tmpRoot, "plugins", "antigravity-star-suite");
  const configFile = path.join(tmpRoot, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ plugins: { swarm: { enabled: true } } }), "utf8");

  const result = installStarSuitePlugin({ targetDir, configFile });
  assert.ok(result.copiedCount >= 18);
  assert.ok(fs.existsSync(path.join(targetDir, "plugin.json")));
  assert.ok(fs.existsSync(path.join(targetDir, "sidecars/star-suite/main.mjs")));

  const { resolveSuiteRoot, loadDreamSkinModules } = await import(
    require("node:url").pathToFileURL(
      path.join(targetDir, "sidecars/star-suite/runtime-loader.mjs")
    ).href
  );
  assert.equal(resolveSuiteRoot(path.join(targetDir, "sidecars/star-suite")).staged, true);
  const loaded = loadDreamSkinModules(path.join(targetDir, "sidecars/star-suite"));
  assert.equal(loaded.staged, true);
  const loader = new loaded.DreamSkinThemeLoader({ rootDir: loaded.skinRoot });
  assert.equal(loader.verifyIntegrity().verified, true);

  const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
  assert.equal(cfg.plugins.swarm.enabled, true);
  assert.equal(cfg.plugins["antigravity-star-suite"].enabled, true);
});

test("plugin UI avoids ES module scripts inside plugin:// iframe and includes themeStyle + concentric radius controls", () => {
  const html = fs.readFileSync(path.join(pluginRoot, "sidecars/star-suite/web/index.html"), "utf8");
  const css = fs.readFileSync(path.join(pluginRoot, "sidecars/star-suite/web/styles.css"), "utf8");
  const app = fs.readFileSync(path.join(pluginRoot, "sidecars/star-suite/web/app.js"), "utf8");
  assert.doesNotMatch(html, /type\s*=\s*["']module["']/i);
  assert.match(html, /<script[^>]+defer[^>]+src=["']\.\/app\.js(?:\?[^"']*)?["']/i);
  assert.match(html, /data-theme-style=["']star-neko["']/);
  assert.match(html, /data-theme-style=["']official["']/);
  assert.match(html, /id=["']rngGlassRadius["']/);
  assert.doesNotMatch(css, /color\s*:\s*var\(--muted\)/i);
  assert.match(css, /--ss-radius-inner/);
  assert.match(css, /html,\s*body\s*\{[\s\S]*background:\s*transparent\s*!important/);
  assert.match(app, /ssStandalone/);
  assert.match(app, /themeStyleBtns/);
  assert.match(app, /rngGlassRadius/);
});

test("widget supervisor defaults to --no-tray and service manages ~/.antigravity-cat-widget settings", async (t) => {
  const { buildWidgetLaunchArgs } = await import("../sidecars/star-suite/widget-supervisor.mjs");
  assert.deepEqual(buildWidgetLaunchArgs({ silent: true, hideTray: true }), ["--background", "--no-tray"]);
  assert.deepEqual(buildWidgetLaunchArgs({ silent: false, hideTray: true }), ["--no-tray"]);
  assert.deepEqual(buildWidgetLaunchArgs({ silent: true, hideTray: false }), ["--background", "--tray"]);

  const { createStarSuiteService, startStandaloneHttpServer } = await import(
    "../sidecars/star-suite/main.mjs"
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "star-widget-cfg-"));
  const settingsFile = path.join(tmpDir, "skin-settings.json");
  const widgetSettingsFile = path.join(tmpDir, "widget-settings.json");
  let reloadCount = 0;
  const fakeWidget = {
    ensureStarted: () => ({ ok: true }),
    recall: () => ({ ok: true }),
    restart: () => ({ ok: true }),
    reloadSettings: () => {
      reloadCount += 1;
      return { ok: true };
    },
    quit: () => ({ ok: true }),
    status: () => ({ available: true, running: true, managedByPlugin: true, error: "" }),
  };

  const service = await createStarSuiteService({
    settingsFile,
    widgetSettingsFile,
    discover: async () => null,
    widgetSupervisor: fakeWidget,
    autoTick: false,
    autoStartWidget: false,
  });
  await service.start();
  const httpSrv = await startStandaloneHttpServer(service, { port: 0 });
  t.after(async () => {
    await httpSrv.close();
    await service.stop();
  });

  const wsRes = await fetch(`${httpSrv.url}/api/widget-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scale: 180, bubbleOn: false, hostWindowOnly: true, sound: true }),
  });
  assert.equal(wsRes.status, 200);
  const wsBody = await wsRes.json();
  assert.equal(wsBody.widgetSettings.scale, 180);
  assert.equal(wsBody.widgetSettings.bubbleOn, false);
  assert.equal(reloadCount, 1);
  const savedWidget = JSON.parse(fs.readFileSync(widgetSettingsFile, "utf8"));
  assert.equal(savedWidget.scale, 180);
  assert.equal(savedWidget.bubbleOn, false);
});

test("media picker uses UTF-8 UTF-16LE encoded PowerShell args and web preview avoids duplicate 4K decoding", async (t) => {
  const { buildWin32PickerArgs } = await import("../sidecars/star-suite/media-picker.mjs");
  const args = buildWin32PickerArgs();
  const encIdx = args.indexOf("-EncodedCommand");
  assert.ok(encIdx >= 0 && args[encIdx + 1]);
  const script = Buffer.from(args[encIdx + 1], "base64").toString("utf16le");
  assert.match(script, /OutputEncoding\s*=\s*\[System\.Text\.UTF8Encoding\]::new\(\$false\)/);
  assert.match(script, /TopMost\s*=\s*\$true/);
  assert.match(script, /ShowDialog\(\$owner\)/);

  const html = fs.readFileSync(path.join(pluginRoot, "sidecars/star-suite/web/index.html"), "utf8");
  const css = fs.readFileSync(path.join(pluginRoot, "sidecars/star-suite/web/styles.css"), "utf8");
  const app = fs.readFileSync(path.join(pluginRoot, "sidecars/star-suite/web/app.js"), "utf8");
  assert.match(html, /id=["']chkVideoSmoothMode["']/);
  assert.match(html, /id=["']rngChatWidth["']/);
  assert.match(html, /data-chat-width=["']94["']/);
  const previewTagMatch = html.match(/<video[^>]+id=["']previewVideo["'][^>]*>/);
  assert.ok(previewTagMatch);
  assert.doesNotMatch(previewTagMatch[0], /\bautoplay\b/i);
  assert.doesNotMatch(previewTagMatch[0], /\bloop\b/i);
  assert.match(css, /::-webkit-scrollbar\s*\{[\s\S]*width:\s*4px;/);
  assert.doesNotMatch(app, /el\.previewVideo\.play\(/);
  assert.match(app, /el\.previewVideo\.pause\(\)/);

  const { createStarSuiteService, startStandaloneHttpServer } = await import(
    "../sidecars/star-suite/main.mjs"
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "star-suite-width-"));
  const service = await createStarSuiteService({
    settingsFile: path.join(tmpDir, "settings.json"),
    discover: async () => null,
    widgetSupervisor: { status: () => ({ available: false, running: false }) },
    autoTick: false,
    autoStartWidget: false,
  });
  await service.start();
  const httpSrv = await startStandaloneHttpServer(service, { port: 0 });
  t.after(async () => {
    await httpSrv.close();
    await service.stop();
  });

  const res = await fetch(`${httpSrv.url}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatWidth: 86, videoSmoothMode: false }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.settings.chatWidth, 86);
  assert.equal(body.settings.videoSmoothMode, false);

  const s2 = await createStarSuiteService({
    settingsFile: path.join(tmpDir, "settings2.json"),
    discover: async () => null,
    widgetSupervisor: { status: () => ({ available: false, running: false }) },
    autoTick: false,
    autoStartWidget: false,
  });
  try {
    assert.notEqual(service.controller.owner, s2.controller.owner);
    assert.match(service.controller.owner, /^antigravity-star-suite-\d+-/);
  } finally {
    await s2.stop();
  }
});
