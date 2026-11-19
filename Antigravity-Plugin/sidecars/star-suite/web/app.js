(() => {
  const $ = (id) => document.getElementById(id);
  try {
    if (!window.parent || window.parent === window) {
      document.documentElement.dataset.ssStandalone = "1";
    }
  } catch {}

  const GLASS_PRESETS = {
    off: { sidebar: [100, 0], content: [100, 0], overlay: [100, 0], control: [100, 0], header: [100, 0], bar: [100, 0] },
    light: { sidebar: [88, 10], content: [82, 12], overlay: [84, 16], control: [86, 10], header: [92, 8], bar: [90, 8] },
    balanced: { sidebar: [78, 18], content: [60, 22], overlay: [68, 24], control: [72, 14], header: [84, 14], bar: [80, 14] },
    clear: { sidebar: [0, 14], content: [0, 16], overlay: [24, 22], control: [0, 12], header: [0, 10], bar: [0, 12] },
  };

  const GLASS_REGIONS = [
    ["sidebar", "侧边栏与标题栏"],
    ["content", "页面"],
    ["overlay", "浮层与对话框"],
    ["control", "控件"],
    ["header", "顶栏"],
    ["bar", "页内工具条"],
  ];

  const GLASS_COLORS = [
    ["#38bdf8", "冰川青"],
    ["#6366f1", "靛蓝紫"],
    ["#10b981", "薄荷绿"],
    ["#f43f5e", "蔷薇粉"],
    ["#f59e0b", "琥珀橙"],
  ];

  const ACCENT_PRESETS = [
    ["", "官方默认", "#6366f1"],
    ["#2563eb", "晴空蓝"],
    ["#0d9488", "松石青"],
    ["#16a34a", "翡翠绿"],
    ["#ea580c", "暖日橙"],
    ["#db2777", "樱花粉"],
    ["#52525b", "石墨灰"],
  ];

  const FONT_ROLES = [
    ["main", "正文"],
    ["secondary", "次要文字"],
    ["muted", "弱化说明"],
    ["faint", "极小说明"],
  ];

  const el = {
    errorBanner: $("errorBanner"),
    hostDot: $("hostDot"),
    hostStatusLabel: $("hostStatusLabel"),
    hostStatusDetail: $("hostStatusDetail"),
    widgetDot: $("widgetDot"),
    widgetStatusLabel: $("widgetStatusLabel"),
    chkSkinEnabled: $("chkSkinEnabled"),
    btnRefresh: $("btnRefresh"),
    tabs: Array.from(document.querySelectorAll("[data-tab]")),
    panels: Array.from(document.querySelectorAll("[data-panel]")),

    activeMediaName: $("activeMediaName"),
    activeMediaBadge: $("activeMediaBadge"),
    btnPickMedia: $("btnPickMedia"),
    btnSelectPreset: $("btnSelectPreset"),
    pathForm: $("pathForm"),
    inputMediaPath: $("inputMediaPath"),
    recentWrap: $("recentWrap"),
    recentList: $("recentList"),
    videoControls: $("videoControls"),
    chkVideoMuted: $("chkVideoMuted"),
    chkVideoSmoothMode: $("chkVideoSmoothMode"),
    btnVideoPause: $("btnVideoPause"),
    selPlaybackRate: $("selPlaybackRate"),
    previewStage: $("previewStage"),
    previewImg: $("previewImg"),
    previewVideo: $("previewVideo"),
    previewScrim: $("previewScrim"),
    outputModeBtns: Array.from(document.querySelectorAll("[data-output-mode]")),
    fitBtns: Array.from(document.querySelectorAll("[data-fit]")),
    chatWidthBtns: Array.from(document.querySelectorAll("[data-chat-width]")),
    rngChatWidth: $("rngChatWidth"),
    valChatWidth: $("valChatWidth"),
    rngOpacity: $("rngOpacity"),
    valOpacity: $("valOpacity"),
    rngZoom: $("rngZoom"),
    valZoom: $("valZoom"),
    rngScrim: $("rngScrim"),
    valScrim: $("valScrim"),
    btnResetCamera: $("btnResetCamera"),

    themeStyleBtns: Array.from(document.querySelectorAll("[data-theme-style]")),
    glassPresetBtns: Array.from(document.querySelectorAll("[data-glass-preset]")),
    glassColorPick: $("glassColorPick"),
    glassRegionList: $("glassRegionList"),
    rngGlassVeil: $("rngGlassVeil"),
    valGlassVeil: $("valGlassVeil"),
    rngGlassRadius: $("rngGlassRadius"),
    valGlassRadius: $("valGlassRadius"),

    fontAccentPick: $("fontAccentPick"),
    fontDarkBtns: Array.from(document.querySelectorAll("[data-dark-sep]")),
    fontRoleList: $("fontRoleList"),

    widgetPathDesc: $("widgetPathDesc"),
    widgetTag: $("widgetTag"),
    btnWidgetRecall: $("btnWidgetRecall"),
    btnWidgetRestart: $("btnWidgetRestart"),
    btnWidgetQuit: $("btnWidgetQuit"),
    chkWidgetHideTray: $("chkWidgetHideTray"),
    chkWidgetAutoLaunch: $("chkWidgetAutoLaunch"),
    widgetCheckboxes: Array.from(document.querySelectorAll("[data-wkey]")),
    rngWidgetScale: $("rngWidgetScale"),
    valWidgetScale: $("valWidgetScale"),
    btnDockLeft: $("btnDockLeft"),
    btnDockRight: $("btnDockRight"),
    btnDockReset: $("btnDockReset"),
    selWidgetSoundSet: $("selWidgetSoundSet"),
    rngWidgetVolume: $("rngWidgetVolume"),
    valWidgetVolume: $("valWidgetVolume"),
  };

  let latestState = null;
  let dragging = null;
  let loadedVideoSrc = "";
  let loadedImgSrc = "";
  let fontPicker = null;
  let debounceTimer = null;
  let isInteracting = false;

  function setError(message) {
    if (!message) {
      el.errorBanner.textContent = "";
      el.errorBanner.classList.add("hidden");
      return;
    }
    el.errorBanner.textContent = message;
    el.errorBanner.classList.remove("hidden");
  }

  async function apiFetch(routePath, init = {}) {
    if (window.sidecar && typeof window.sidecar.fetch === "function") {
      return window.sidecar.fetch(routePath, init);
    }
    return fetch("." + routePath, init);
  }

  async function requestJson(routePath, method = "GET", body = null) {
    const init = { method, headers: {} };
    if (body !== null) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await apiFetch(routePath, init);
    const text = await response.text();
    let parsed = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: text };
      }
    }
    if (!response.ok) {
      throw new Error(parsed.error || `请求失败 (${response.status})`);
    }
    return parsed;
  }

  function scheduleSave(patch) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      saveSettings(patch);
    }, 180);
  }

  async function saveSettings(patch) {
    try {
      setError("");
      const next = await requestJson("/api/settings", "POST", patch);
      renderState(next);
    } catch (error) {
      setError(error.message);
    }
  }

  async function saveWidgetSettings(patch) {
    try {
      setError("");
      const next = await requestJson("/api/widget-settings", "POST", patch);
      renderState(next);
    } catch (error) {
      setError(error.message);
    }
  }

  // ── 面板自身实时同步用户的玻璃与字体颜色 ──
  function syncPanelOwnTheme(s) {
    const rs = document.documentElement.style;
    const g = s.glass || {};
    const regions = g.regions || {};
    const themeStyle = g.themeStyle === "official" ? "official" : "star-neko";
    document.documentElement.dataset.ssThemeStyle = themeStyle;
    const rawRadius = Number(g.radius);
    const radius = Number.isFinite(rawRadius) ? Math.min(24, Math.max(8, Math.round(rawRadius))) : 16;
    rs.setProperty("--ss-radius", radius + "px");
    rs.setProperty("--ss-glass-tint", g.tint || "#ffffff");
    if (regions.content) {
      rs.setProperty("--ss-glass-content-fill", Math.max(18, regions.content.fill) + "%");
      rs.setProperty("--ss-glass-content-blur", regions.content.blur + "px");
    }
    if (regions.overlay) {
      rs.setProperty("--ss-glass-overlay-fill", Math.max(24, regions.overlay.fill) + "%");
      rs.setProperty("--ss-glass-overlay-blur", Math.max(10, regions.overlay.blur) + "px");
    }

    const f = s.font || {};
    const darkPalette = f.darkSeparate ? { ...(f.colors || {}), ...(f.colorsDark || {}) } : (f.colors || {});
    if (f.accent) rs.setProperty("--ss-accent", f.accent);
    else rs.removeProperty("--ss-accent");
    if (darkPalette.main) rs.setProperty("--ss-fg", darkPalette.main);
    else rs.removeProperty("--ss-fg");
    if (darkPalette.secondary) rs.setProperty("--ss-fg-2", darkPalette.secondary);
    else rs.removeProperty("--ss-fg-2");
    if (darkPalette.muted) rs.setProperty("--ss-muted", darkPalette.muted);
    else rs.removeProperty("--ss-muted");
    if (darkPalette.faint) rs.setProperty("--ss-faint", darkPalette.faint);
    else rs.removeProperty("--ss-faint");
  }

  // ── 图三同款 HSV 颜色计算与可拖拽取色器 ──
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return [255, 255, 255];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbHex(r, g, b) {
    return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx];
  }

  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  function closeFontPicker() {
    if (!fontPicker) return;
    if (fontPicker.onDoc) document.removeEventListener("pointerdown", fontPicker.onDoc, true);
    fontPicker.el.remove();
    fontPicker = null;
    isInteracting = false;
  }

  function openFontPicker(anchor, initialHex, onApply) {
    closeFontPicker();
    isInteracting = true;
    let [h, s, v] = rgbToHsv(...hexToRgb(initialHex || "#ffffff"));

    const picker = document.createElement("div");
    picker.className = "fc-picker";
    picker.innerHTML =
      '<div class="fc-picker-bar"><span>选择颜色</span><button type="button" class="fc-picker-close" aria-label="关闭">✕</button></div>' +
      '<div class="fc-sv"><div class="fc-sv-white"></div><div class="fc-sv-black"></div><span class="fc-sv-thumb"></span></div>' +
      '<div class="fc-hue"><span class="fc-hue-thumb"></span></div>' +
      '<div class="fc-picker-foot"><button type="button" class="fc-clear">清除</button><input class="fc-hex-input" spellcheck="false" maxlength="7"></div>';
    document.body.appendChild(picker);

    const rect = anchor.getBoundingClientRect();
    picker.style.left = Math.max(8, Math.min(window.innerWidth - 236, rect.left - 110)) + "px";
    picker.style.top = Math.max(8, Math.min(window.innerHeight - 280, rect.bottom + 8)) + "px";

    const sv = picker.querySelector(".fc-sv");
    const svThumb = picker.querySelector(".fc-sv-thumb");
    const hue = picker.querySelector(".fc-hue");
    const hueThumb = picker.querySelector(".fc-hue-thumb");
    const hexIn = picker.querySelector(".fc-hex-input");

    const paint = (emit = true) => {
      sv.style.background = `hsl(${h}, 100%, 50%)`;
      svThumb.style.left = s * 100 + "%";
      svThumb.style.top = (1 - v) * 100 + "%";
      hueThumb.style.left = (h / 360) * 100 + "%";
      const out = rgbHex(...hsvToRgb(h, s, v));
      if (document.activeElement !== hexIn) hexIn.value = out;
      if (emit) onApply(out);
    };

    const bindDrag = (node, calcFn) => {
      node.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        node.setPointerCapture(ev.pointerId);
        calcFn(ev);
        const mv = (e2) => calcFn(e2);
        const up = () => {
          node.removeEventListener("pointermove", mv);
          node.removeEventListener("pointerup", up);
        };
        node.addEventListener("pointermove", mv);
        node.addEventListener("pointerup", up);
      });
    };

    bindDrag(sv, (ev) => {
      const r = sv.getBoundingClientRect();
      s = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      v = 1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      paint(true);
    });

    bindDrag(hue, (ev) => {
      const r = hue.getBoundingClientRect();
      h = 360 * Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      paint(true);
    });

    hexIn.addEventListener("input", () => {
      if (!/^#[0-9a-f]{6}$/i.test(hexIn.value)) return;
      [h, s, v] = rgbToHsv(...hexToRgb(hexIn.value));
      paint(true);
    });

    picker.querySelector(".fc-clear").addEventListener("click", () => {
      onApply("");
      closeFontPicker();
    });
    picker.querySelector(".fc-picker-close").addEventListener("click", closeFontPicker);

    const onDoc = (ev) => {
      if (!picker.contains(ev.target) && !anchor.contains(ev.target)) closeFontPicker();
    };
    document.addEventListener("pointerdown", onDoc, true);
    paint(false);
    fontPicker = { el: picker, onDoc };
  }

  // ── 预览与各区域渲染 ──
  function updatePreviewMedia(state) {
    const s = state.settings;
    const media = state.activeMedia || {};
    const isVideo = media.mediaKind === "video" && !media.wallpaperError && media.mediaUrl;
    const fitMode = s.fit === "adaptive" ? "cover" : s.fit;
    const opacity = s.enabled ? s.opacity / 100 : 0.35;
    const objectPos = `${s.positionX}% ${s.positionY}%`;
    const transform = `scale(${s.zoom})`;

    if (isVideo) {
      el.previewImg.classList.add("hidden");
      el.previewVideo.classList.remove("hidden");
      // Keep preview frozen at a poster frame so we never decode two 4K streams simultaneously
      el.previewVideo.autoplay = false;
      el.previewVideo.loop = false;
      el.previewVideo.muted = true;
      if (loadedVideoSrc !== media.mediaUrl) {
        loadedVideoSrc = media.mediaUrl;
        const pausePreview = () => {
          if (loadedVideoSrc !== media.mediaUrl) return;
          el.previewVideo.pause();
        };
        el.previewVideo.onloadeddata = () => {
          const dur = el.previewVideo.duration;
          if (Number.isFinite(dur) && dur > 0.25 && el.previewVideo.currentTime < 0.05) {
            el.previewVideo.onseeked = () => {
              el.previewVideo.onseeked = null;
              pausePreview();
            };
            try {
              el.previewVideo.currentTime = 0.1;
              return;
            } catch {}
          }
          pausePreview();
        };
        el.previewVideo.src = media.mediaUrl;
      } else {
        el.previewVideo.pause();
      }
      el.previewVideo.style.objectFit = fitMode;
      el.previewVideo.style.objectPosition = objectPos;
      el.previewVideo.style.opacity = String(opacity);
      el.previewVideo.style.transform = transform;
    } else {
      el.previewVideo.classList.add("hidden");
      if (loadedVideoSrc) {
        el.previewVideo.pause();
        el.previewVideo.removeAttribute("src");
        el.previewVideo.load();
        loadedVideoSrc = "";
      }
      el.previewImg.classList.remove("hidden");
      const targetSrc = media.mediaUrl || "./preset-wallpaper.png";
      if (loadedImgSrc !== targetSrc) {
        loadedImgSrc = targetSrc;
        el.previewImg.src = targetSrc;
      }
      el.previewImg.style.objectFit = fitMode;
      el.previewImg.style.objectPosition = objectPos;
      el.previewImg.style.opacity = String(opacity);
      el.previewImg.style.transform = transform;
    }

    const veilPct = Number(s.glass?.veil || 0);
    const scrimAlpha = veilPct > 0 ? Math.min(0.95, veilPct / 100) : Math.max(0, Math.min(0.6, (s.scrim ?? 12) / 100));
    el.previewScrim.style.background = `linear-gradient(180deg, rgba(16, 17, 24, ${scrimAlpha * 0.45}), rgba(10, 12, 18, ${scrimAlpha * 0.8}))`;
  }

  function renderRecentChips(state) {
    const items = state.recentItems || [];
    if (!items.length) {
      el.recentWrap.classList.add("hidden");
      el.recentList.replaceChildren();
      return;
    }
    el.recentWrap.classList.remove("hidden");
    el.recentList.replaceChildren();
    const activePath = state.settings.mediaType === "preset" ? "" : state.settings.customMediaPath;

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-chip";
      if (activePath && item.path === activePath) btn.classList.add("active");
      if (!item.exists) btn.classList.add("missing");
      btn.title = item.path;
      btn.textContent = `${item.kind === "video" ? "🎬" : "🖼"} ${item.name}`;
      btn.addEventListener("click", async () => {
        try {
          setError("");
          const next = await requestJson("/api/select-media", "POST", { path: item.path });
          renderState(next);
        } catch (error) {
          setError(error.message);
        }
      });
      el.recentList.appendChild(btn);
    }
  }

  function activeGlassPreset(regions) {
    for (const [id, shape] of Object.entries(GLASS_PRESETS)) {
      const match = Object.entries(shape).every(
        ([k, [f, b]]) => regions[k]?.fill === f && regions[k]?.blur === b
      );
      if (match) return id;
    }
    return "custom";
  }

  function renderGlassControls(s) {
    const g = s.glass || { themeStyle: "star-neko", tint: "#ffffff", veil: 0, radius: 16, regions: {} };
    const themeStyle = g.themeStyle === "official" ? "official" : "star-neko";
    for (const btn of el.themeStyleBtns) {
      btn.classList.toggle("active", btn.dataset.themeStyle === themeStyle);
    }
    const regions = g.regions || {};
    const curPreset = activeGlassPreset(regions);
    for (const btn of el.glassPresetBtns) {
      btn.classList.toggle("active", btn.dataset.glassPreset === curPreset);
    }

    // 玻璃颜色色点 + 自定义取色器
    const curTint = (g.tint || "").toLowerCase();
    el.glassColorPick.replaceChildren();
    for (const [hex, title] of GLASS_COLORS) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "ss-swatch-dot" + (curTint === hex ? " on" : "");
      dot.title = title;
      dot.style.setProperty("--sw", hex);
      dot.addEventListener("click", () => saveSettings({ glass: { tint: hex } }));
      el.glassColorPick.appendChild(dot);
    }
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "ss-fc-swatch" + (curTint ? "" : " empty");
    sw.style.setProperty("--fc", curTint || "transparent");
    sw.title = "自定义玻璃颜色";
    const hexCode = document.createElement("code");
    hexCode.className = "ss-fc-hex";
    hexCode.textContent = curTint || "跟随主题";
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ss-btn-link" + (curTint ? "" : " hidden");
    resetBtn.textContent = "重置";
    resetBtn.addEventListener("click", () => {
      closeFontPicker();
      saveSettings({ glass: { tint: "" } });
    });
    sw.addEventListener("click", () => {
      openFontPicker(sw, curTint || "#ffffff", (out) => {
        sw.style.setProperty("--fc", out || "transparent");
        sw.classList.toggle("empty", !out);
        hexCode.textContent = out || "跟随主题";
        resetBtn.classList.toggle("hidden", !out);
        document.documentElement.style.setProperty("--ss-glass-tint", out || "#ffffff");
        scheduleSave({ glass: { tint: out } });
      });
    });
    el.glassColorPick.append(sw, hexCode, resetBtn);

    // 6 区域滑块
    if (!isInteracting) {
      el.glassRegionList.replaceChildren();
      for (const [key, label] of GLASS_REGIONS) {
        const part = regions[key] || { fill: 70, blur: 16 };
        const row = document.createElement("div");
        row.className = "ss-row";
        const who = document.createElement("div");
        who.className = "ss-who";
        const nameEl = document.createElement("div");
        nameEl.className = "ss-name";
        nameEl.textContent = label;
        who.appendChild(nameEl);

        const sliders = document.createElement("div");
        sliders.className = "ss-dual-sliders";
        const mine = { fill: Number(part.fill), blur: Number(part.blur) };
        for (const [metric, mLabel, max, unit] of [
          ["fill", "不透明度", 100, "%"],
          ["blur", "模糊", 40, "px"],
        ]) {
          const wrap = document.createElement("label");
          wrap.className = "ss-mini-slider";
          const span = document.createElement("span");
          span.textContent = mLabel;
          const rng = document.createElement("input");
          rng.type = "range";
          rng.min = "0";
          rng.max = String(max);
          rng.step = "1";
          rng.value = String(mine[metric]);
          const out = document.createElement("output");
          out.textContent = mine[metric] + unit;
          rng.addEventListener("pointerdown", () => { isInteracting = true; });
          rng.addEventListener("input", () => {
            mine[metric] = Number(rng.value);
            out.textContent = rng.value + unit;
          });
          rng.addEventListener("change", () => {
            isInteracting = false;
            saveSettings({ glass: { regions: { [key]: { ...mine } } } });
          });
          wrap.append(span, rng, out);
          sliders.appendChild(wrap);
        }
        row.append(who, sliders);
        el.glassRegionList.appendChild(row);
      }
    }

    const veilVal = Number(g.veil || 0);
    el.rngGlassVeil.value = String(veilVal);
    el.valGlassVeil.textContent = veilVal > 0 ? veilVal + "%" : "自动";

    const rawRadius = Number(g.radius);
    const radiusVal = Number.isFinite(rawRadius) ? Math.min(24, Math.max(8, Math.round(rawRadius))) : 16;
    el.rngGlassRadius.value = String(radiusVal);
    el.valGlassRadius.textContent = radiusVal + "px";
  }

  function buildFontRoleRow(roleKey, label, currentHex, fieldKey) {
    const row = document.createElement("div");
    row.className = "ss-row";
    const who = document.createElement("div");
    who.className = "ss-who";
    const title = document.createElement("div");
    title.className = "ss-name";
    title.textContent = label;
    who.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "ss-color-actions";
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "ss-fc-swatch" + (currentHex ? "" : " empty");
    sw.style.setProperty("--fc", currentHex || "transparent");
    const hexText = document.createElement("code");
    hexText.className = "ss-fc-hex";
    hexText.textContent = currentHex || "跟随主题";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "ss-btn-link" + (currentHex ? "" : " hidden");
    reset.textContent = "重置";

    sw.addEventListener("click", () => {
      openFontPicker(sw, currentHex || "#ffffff", (out) => {
        sw.style.setProperty("--fc", out || "transparent");
        sw.classList.toggle("empty", !out);
        hexText.textContent = out || "跟随主题";
        reset.classList.toggle("hidden", !out);
        scheduleSave({ font: { [fieldKey]: { [roleKey]: out } } });
      });
    });

    reset.addEventListener("click", () => {
      closeFontPicker();
      saveSettings({ font: { [fieldKey]: { [roleKey]: "" } } });
    });

    actions.append(sw, hexText, reset);
    row.append(who, actions);
    return row;
  }

  function renderFontControls(s) {
    const f = s.font || { accent: "", darkSeparate: false, colors: {}, colorsDark: {} };
    const curAccent = (f.accent || "").toLowerCase();

    el.fontAccentPick.replaceChildren();
    for (const [val, label, dotHex] of ACCENT_PRESETS) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "ss-swatch-dot" + (curAccent === val ? " on" : "");
      dot.title = label;
      dot.style.setProperty("--sw", dotHex || val);
      dot.addEventListener("click", () => saveSettings({ font: { accent: val } }));
      el.fontAccentPick.appendChild(dot);
    }
    const customDot = document.createElement("button");
    customDot.type = "button";
    customDot.className = "ss-fc-swatch" + (curAccent ? "" : " empty");
    customDot.style.setProperty("--fc", curAccent || "transparent");
    customDot.title = "自定义强调色";
    customDot.addEventListener("click", () => {
      openFontPicker(customDot, curAccent || "#6366f1", (out) => {
        customDot.style.setProperty("--fc", out || "transparent");
        customDot.classList.toggle("empty", !out);
        scheduleSave({ font: { accent: out } });
      });
    });
    el.fontAccentPick.appendChild(customDot);

    for (const btn of el.fontDarkBtns) {
      btn.classList.toggle("active", (btn.dataset.darkSep === "true") === Boolean(f.darkSeparate));
    }

    if (!isInteracting) {
      el.fontRoleList.replaceChildren();
      for (const [role, label] of FONT_ROLES) {
        el.fontRoleList.appendChild(buildFontRoleRow(role, label, f.colors?.[role] || "", "colors"));
      }
      if (f.darkSeparate) {
        const split = document.createElement("div");
        split.className = "ss-split-head";
        split.textContent = "深色主题独立色值";
        el.fontRoleList.appendChild(split);
        for (const [role, label] of FONT_ROLES) {
          el.fontRoleList.appendChild(buildFontRoleRow(role, label, f.colorsDark?.[role] || "", "colorsDark"));
        }
      }
    }
  }

  function renderWidgetControls(state) {
    const s = state.settings;
    const widget = state.widget || {};
    const ws = state.widgetSettings || {};

    el.chkWidgetHideTray.checked = s.widgetHideTray !== false;
    el.chkWidgetAutoLaunch.checked = s.widgetAutoLaunch !== false;

    if (!widget.available) {
      el.widgetDot.className = "ss-dot warn";
      el.widgetStatusLabel.textContent = "未安装";
      el.widgetTag.textContent = "未找到 EXE";
      el.widgetPathDesc.textContent = "未找到 StarWidget.exe，请先安装星语桌宠挂件";
    } else if (widget.running) {
      el.widgetDot.className = "ss-dot ok";
      el.widgetStatusLabel.textContent = "桌宠运行中";
      el.widgetTag.textContent = s.widgetHideTray !== false ? "插件内托管" : "托盘+插件";
      el.widgetPathDesc.textContent = widget.path || "已在宿主内受控运行";
    } else {
      el.widgetDot.className = "ss-dot";
      el.widgetStatusLabel.textContent = "桌宠已停";
      el.widgetTag.textContent = "已停止";
      el.widgetPathDesc.textContent = widget.path || "点击唤起即可启动桌宠";
    }

    el.btnWidgetRecall.disabled = !widget.available;
    el.btnWidgetRestart.disabled = !widget.available;
    el.btnWidgetQuit.disabled = !widget.running;

    for (const chk of el.widgetCheckboxes) {
      const key = chk.dataset.wkey;
      chk.checked = Boolean(ws[key]);
      if (key === "alwaysOnTop") chk.disabled = Boolean(ws.hostWindowOnly);
    }

    const scale = Number(ws.scale || 220);
    if (!isInteracting) {
      el.rngWidgetScale.value = String(scale);
    }
    el.valWidgetScale.textContent = Math.round(scale) + "px";

    if (ws.soundSet) el.selWidgetSoundSet.value = ws.soundSet;
    const vol = Math.round(Number(ws.volume ?? 0.35) * 100);
    if (!isInteracting) {
      el.rngWidgetVolume.value = String(vol);
    }
    el.valWidgetVolume.textContent = vol + "%";
  }

  function renderState(state) {
    latestState = state;
    const s = state.settings;
    const media = state.activeMedia || {};
    const host = state.status || {};
    const widget = state.widget || {};

    syncPanelOwnTheme(s);
    setError(state.wallpaperError || widget.error || "");

    el.chkSkinEnabled.checked = Boolean(s.enabled);
    if (host.applied) {
      el.hostDot.className = "ss-dot ok";
      el.hostStatusLabel.textContent = "皮肤已生效";
    } else if (host.connected) {
      el.hostDot.className = "ss-dot warn";
      el.hostStatusLabel.textContent = "已连接宿主";
    } else {
      el.hostDot.className = "ss-dot";
      el.hostStatusLabel.textContent = "未连接";
    }
    el.hostStatusDetail.textContent = host.message || "等待检测 Antigravity";

    for (const btn of el.outputModeBtns) {
      btn.classList.toggle("active", btn.dataset.outputMode === s.outputMode);
    }
    for (const btn of el.fitBtns) {
      btn.classList.toggle("active", btn.dataset.fit === s.fit);
    }

    el.activeMediaBadge.textContent =
      s.mediaType === "video" ? "MP4 / 视频" : s.mediaType === "image" ? "自定义图片" : "内置预设";
    el.activeMediaName.textContent = media.mediaName || state.wallpaper || "Gemini 角色立绘预设";
    el.btnSelectPreset.classList.toggle("hidden", s.mediaType === "preset");
    if (document.activeElement !== el.inputMediaPath) {
      el.inputMediaPath.value = s.mediaType === "preset" ? "" : s.customMediaPath || "";
    }

    const showVideo = s.mediaType === "video" || media.mediaKind === "video";
    el.videoControls.classList.toggle("hidden", !showVideo);
    el.chkVideoMuted.checked = s.videoMuted !== false;
    el.chkVideoSmoothMode.checked = s.videoSmoothMode !== false;
    el.btnVideoPause.textContent = s.videoPaused ? "继续" : "暂停";
    el.selPlaybackRate.value = String(s.videoPlaybackRate ?? 1);

    const chatWidth = Math.round(Number(s.chatWidth || 0));
    for (const btn of el.chatWidthBtns) {
      const target = Number(btn.dataset.chatWidth);
      btn.classList.toggle("active", chatWidth < 45 ? target === 0 : chatWidth === target);
    }
    if (!isInteracting) {
      el.rngChatWidth.value = String(chatWidth >= 45 ? chatWidth : 60);
      el.rngOpacity.value = String(s.opacity);
      el.rngScrim.value = String(s.scrim);
      el.rngZoom.value = String(s.zoom);
    }
    el.valChatWidth.textContent = chatWidth >= 45 ? chatWidth + "%" : "官方";
    el.valOpacity.textContent = Math.round(s.opacity) + "%";
    el.valScrim.textContent = Math.round(s.scrim) + "%";
    el.valZoom.textContent = Number(s.zoom).toFixed(2) + "x";

    renderRecentChips(state);
    updatePreviewMedia(state);
    renderGlassControls(s);
    renderFontControls(s);
    renderWidgetControls(state);
  }

  async function fetchState() {
    try {
      const next = await requestJson("/api/state", "GET");
      renderState(next);
    } catch (error) {
      setError(error.message);
    }
  }

  // ── 事件绑定 ──
  for (const tab of el.tabs) {
    tab.addEventListener("click", () => {
      closeFontPicker();
      const target = tab.dataset.tab;
      for (const t of el.tabs) {
        const active = t.dataset.tab === target;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
      }
      for (const p of el.panels) {
        p.classList.toggle("hidden", p.dataset.panel !== target);
      }
    });
  }

  el.btnRefresh.addEventListener("click", async () => {
    try {
      setError("");
      renderState(await requestJson("/api/refresh", "POST", {}));
    } catch (error) {
      setError(error.message);
    }
  });

  el.chkSkinEnabled.addEventListener("change", () => saveSettings({ enabled: el.chkSkinEnabled.checked }));

  for (const btn of el.outputModeBtns) {
    btn.addEventListener("click", () => saveSettings({ outputMode: btn.dataset.outputMode }));
  }
  for (const btn of el.fitBtns) {
    btn.addEventListener("click", () => saveSettings({ fit: btn.dataset.fit }));
  }

  el.btnPickMedia.addEventListener("click", async () => {
    el.btnPickMedia.disabled = true;
    try {
      setError("");
      const res = await requestJson("/api/pick-media", "POST", {});
      if (res.state) renderState(res.state);
    } catch (error) {
      setError(error.message);
    } finally {
      el.btnPickMedia.disabled = false;
    }
  });

  el.btnSelectPreset.addEventListener("click", async () => {
    try {
      setError("");
      renderState(await requestJson("/api/select-media", "POST", { mediaType: "preset" }));
    } catch (error) {
      setError(error.message);
    }
  });

  el.pathForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const target = el.inputMediaPath.value.trim();
    if (!target) return;
    try {
      setError("");
      renderState(await requestJson("/api/select-media", "POST", { path: target }));
    } catch (error) {
      setError(error.message);
    }
  });

  el.chkVideoMuted.addEventListener("change", () => saveSettings({ videoMuted: el.chkVideoMuted.checked }));
  el.chkVideoSmoothMode.addEventListener("change", () => saveSettings({ videoSmoothMode: el.chkVideoSmoothMode.checked }));
  el.btnVideoPause.addEventListener("click", () => saveSettings({ videoPaused: !latestState?.settings?.videoPaused }));
  el.selPlaybackRate.addEventListener("change", () => saveSettings({ videoPlaybackRate: Number(el.selPlaybackRate.value) }));
  el.btnResetCamera.addEventListener("click", () => saveSettings({ positionX: 50, positionY: 50, zoom: 1 }));

  for (const btn of el.chatWidthBtns) {
    btn.addEventListener("click", () => saveSettings({ chatWidth: Number(btn.dataset.chatWidth) }));
  }
  el.rngChatWidth.addEventListener("pointerdown", () => { isInteracting = true; });
  el.rngChatWidth.addEventListener("input", () => {
    const v = Math.round(Number(el.rngChatWidth.value));
    el.valChatWidth.textContent = v + "%";
  });
  el.rngChatWidth.addEventListener("change", () => {
    isInteracting = false;
    saveSettings({ chatWidth: Math.round(Number(el.rngChatWidth.value)) });
  });

  for (const [input, key, fmt, output] of [
    [el.rngOpacity, "opacity", (v) => `${Math.round(v)}%`, el.valOpacity],
    [el.rngScrim, "scrim", (v) => `${Math.round(v)}%`, el.valScrim],
    [el.rngZoom, "zoom", (v) => `${Number(v).toFixed(2)}x`, el.valZoom],
  ]) {
    input.addEventListener("pointerdown", () => { isInteracting = true; });
    input.addEventListener("input", () => {
      const v = Number(input.value);
      output.textContent = fmt(v);
      if (latestState) {
        latestState.settings[key] = v;
        updatePreviewMedia(latestState);
      }
    });
    input.addEventListener("change", () => {
      isInteracting = false;
      saveSettings({ [key]: Number(input.value) });
    });
  }

  for (const btn of el.themeStyleBtns) {
    btn.addEventListener("click", () => {
      saveSettings({ glass: { themeStyle: btn.dataset.themeStyle } });
    });
  }

  for (const btn of el.glassPresetBtns) {
    btn.addEventListener("click", () => {
      const shape = GLASS_PRESETS[btn.dataset.glassPreset];
      if (!shape) return;
      const regions = Object.fromEntries(
        Object.entries(shape).map(([k, [fill, blur]]) => [k, { fill, blur }])
      );
      saveSettings({ glass: { regions } });
    });
  }

  el.rngGlassVeil.addEventListener("pointerdown", () => { isInteracting = true; });
  el.rngGlassVeil.addEventListener("input", () => {
    const v = Number(el.rngGlassVeil.value);
    el.valGlassVeil.textContent = v > 0 ? v + "%" : "自动";
  });
  el.rngGlassVeil.addEventListener("change", () => {
    isInteracting = false;
    saveSettings({ glass: { veil: Number(el.rngGlassVeil.value) } });
  });

  el.rngGlassRadius.addEventListener("pointerdown", () => { isInteracting = true; });
  el.rngGlassRadius.addEventListener("input", () => {
    const v = Number(el.rngGlassRadius.value);
    el.valGlassRadius.textContent = v + "px";
    document.documentElement.style.setProperty("--ss-radius", v + "px");
  });
  el.rngGlassRadius.addEventListener("change", () => {
    isInteracting = false;
    saveSettings({ glass: { radius: Number(el.rngGlassRadius.value) } });
  });

  for (const btn of el.fontDarkBtns) {
    btn.addEventListener("click", () => {
      closeFontPicker();
      saveSettings({ font: { darkSeparate: btn.dataset.darkSep === "true" } });
    });
  }

  el.chkWidgetHideTray.addEventListener("change", async () => {
    const res = await requestJson("/api/widget", "POST", { action: "hideTray", value: el.chkWidgetHideTray.checked });
    if (res.state) renderState(res.state);
  });

  el.chkWidgetAutoLaunch.addEventListener("change", async () => {
    const res = await requestJson("/api/widget", "POST", { action: "autoLaunch", value: el.chkWidgetAutoLaunch.checked });
    if (res.state) renderState(res.state);
  });

  for (const [btn, action] of [
    [el.btnWidgetRecall, "recall"],
    [el.btnWidgetRestart, "restart"],
    [el.btnWidgetQuit, "quit"],
    [el.btnDockLeft, "dock-left"],
    [el.btnDockRight, "dock-right"],
    [el.btnDockReset, "reset-pos"],
  ]) {
    btn.addEventListener("click", async () => {
      try {
        setError("");
        const res = await requestJson("/api/widget", "POST", { action });
        if (res.state) renderState(res.state);
        setTimeout(fetchState, 900);
      } catch (error) {
        setError(error.message);
      }
    });
  }

  for (const chk of el.widgetCheckboxes) {
    chk.addEventListener("change", () => saveWidgetSettings({ [chk.dataset.wkey]: chk.checked }));
  }

  el.rngWidgetScale.addEventListener("pointerdown", () => { isInteracting = true; });
  el.rngWidgetScale.addEventListener("input", () => {
    el.valWidgetScale.textContent = el.rngWidgetScale.value + "px";
  });
  el.rngWidgetScale.addEventListener("change", () => {
    isInteracting = false;
    saveWidgetSettings({ scale: Number(el.rngWidgetScale.value) });
  });

  el.selWidgetSoundSet.addEventListener("change", () => saveWidgetSettings({ soundSet: el.selWidgetSoundSet.value }));

  el.rngWidgetVolume.addEventListener("pointerdown", () => { isInteracting = true; });
  el.rngWidgetVolume.addEventListener("input", () => {
    el.valWidgetVolume.textContent = el.rngWidgetVolume.value + "%";
  });
  el.rngWidgetVolume.addEventListener("change", () => {
    isInteracting = false;
    saveWidgetSettings({ volume: Number(el.rngWidgetVolume.value) / 100 });
  });

  el.previewStage.addEventListener("pointerdown", (event) => {
    if (!latestState) return;
    isInteracting = true;
    el.previewStage.setPointerCapture(event.pointerId);
    dragging = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: latestState.settings.positionX,
      baseY: latestState.settings.positionY,
    };
  });

  el.previewStage.addEventListener("pointermove", (event) => {
    if (!dragging || !latestState) return;
    const rect = el.previewStage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dxPct = ((event.clientX - dragging.startX) / rect.width) * 100;
    const dyPct = ((event.clientY - dragging.startY) / rect.height) * 100;
    latestState.settings.positionX = Math.max(0, Math.min(100, dragging.baseX - dxPct));
    latestState.settings.positionY = Math.max(0, Math.min(100, dragging.baseY - dyPct));
    updatePreviewMedia(latestState);
  });

  const endDrag = () => {
    if (!dragging || !latestState) return;
    dragging = null;
    isInteracting = false;
    saveSettings({
      positionX: Math.round(latestState.settings.positionX * 10) / 10,
      positionY: Math.round(latestState.settings.positionY * 10) / 10,
    });
  };
  el.previewStage.addEventListener("pointerup", endDrag);
  el.previewStage.addEventListener("pointercancel", endDrag);

  fetchState();
  window.addEventListener("focus", () => {
    if (!dragging && !isInteracting) fetchState();
  });
  setInterval(() => {
    if (!document.hidden && !dragging && !isInteracting) fetchState();
  }, 4000);
})();
