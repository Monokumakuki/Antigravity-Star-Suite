(async () => {
  const api = window.dreamApi;
  const $ = (id) => document.getElementById(id);
  const PRESET_SRC = "../../assets/wallpapers/gemini-character-sheet-v1/wallpaper.png";

  let data = await api.get();
  let timer;
  let panTimer;
  let drag = null;
  let draft = null;
  let loadedImgSrc = PRESET_SRC;
  let loadedVideoSrc = "";
  const original = { ...data.settings };
  let pending = Promise.resolve();

  function isVideoMode(state = data, draftObj = draft) {
    const s = { ...state.settings, ...draftObj };
    const media = state.activeMedia || {};
    return s.mediaType === "video" || media.mediaKind === "video";
  }

  function activeMediaElement() {
    return isVideoMode() ? $("wallpaper-video") : $("wallpaper");
  }

  function syncMediaElements() {
    const error = data.wallpaperError;
    const s = { ...data.settings, ...draft };
    const media = data.activeMedia || {};
    const videoActive = !error && media.mediaKind === "video" && Boolean(media.mediaUrl);
    const imgEl = $("wallpaper");
    const vidEl = $("wallpaper-video");

    if (error) {
      imgEl.hidden = true;
      vidEl.hidden = true;
      vidEl.pause();
    } else if (videoActive) {
      imgEl.hidden = true;
      vidEl.hidden = false;
      if (loadedVideoSrc !== media.mediaUrl) {
        loadedVideoSrc = media.mediaUrl;
        vidEl.src = media.mediaUrl;
      }
      vidEl.muted = s.videoMuted !== false;
      vidEl.playbackRate = Number(s.videoPlaybackRate || 1);
      if (s.videoPaused) {
        vidEl.pause();
      } else {
        vidEl.play().catch(() => {});
      }
    } else {
      vidEl.hidden = true;
      if (loadedVideoSrc) {
        vidEl.pause();
        vidEl.removeAttribute("src");
        vidEl.load();
        loadedVideoSrc = "";
      }
      imgEl.hidden = false;
      const targetSrc = s.mediaType !== "preset" && media.mediaUrl ? media.mediaUrl : PRESET_SRC;
      if (loadedImgSrc !== targetSrc) {
        loadedImgSrc = targetSrc;
        imgEl.src = targetSrc;
      }
    }

    $("enabled").disabled = !!error && !data.settings.enabled;
    $("asset-status").textContent = error || "轻一点，工作更舒服。";
  }

  function renderRecentChips() {
    const wrap = $("recent-media");
    const items = data.recentItems || [];
    if (!items.length) {
      wrap.hidden = true;
      wrap.replaceChildren();
      return;
    }
    wrap.hidden = false;
    wrap.replaceChildren();
    const currentPath = data.settings.mediaType === "preset" ? "" : data.settings.customMediaPath;
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      if (currentPath && item.path === currentPath) btn.classList.add("active");
      if (!item.exists) btn.classList.add("missing");
      btn.title = item.path;
      btn.textContent = `${item.kind === "video" ? "🎬" : "🖼"} ${item.name}`;
      btn.onclick = () => {
        pending = pending.then(async () => {
          try {
            data = await api.selectMediaPath(item.path);
            $("saved").textContent = "已切换背景";
            syncMediaElements();
            render();
          } catch (e) {
            $("saved").textContent = e.message;
          }
        });
      };
      wrap.appendChild(btn);
    }
  }

  function render() {
    const s = { ...data.settings, ...draft };
    const media = data.activeMedia || {};
    document
      .querySelectorAll("[data-output-mode]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.outputMode === s.outputMode)));

    for (const key of ["positionX", "positionY"]) {
      if (document.activeElement !== $(key)) $(key).value = s[key];
    }
    $("zoom").value = s.zoom * 100;
    $("zoom-value").textContent = Math.round(s.zoom * 100) + "%";
    renderPosition(s);
    $("opacity").value = s.opacity;
    $("opacity-value").textContent = s.opacity + "%";
    const opacityVal = String(s.opacity / 100);
    $("wallpaper").style.opacity = opacityVal;
    $("wallpaper-video").style.opacity = opacityVal;
    $("enabled").checked = s.enabled;
    if (document.activeElement !== $("scrim")) $("scrim").value = s.scrim;
    $("scrim-value").textContent = s.scrim + "%";
    $("shade").style.opacity = s.scrim / 100;

    const fitVal = s.fit === "contain" ? "contain" : "cover";
    $("wallpaper").style.objectFit = fitVal;
    $("wallpaper-video").style.objectFit = fitVal;
    document
      .querySelectorAll("[data-fit]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fit === s.fit)));
    $("fit-note").textContent =
      s.fit === "adaptive"
        ? "随窗口铺满，不留上下空带；原画面不拉伸，边缘适度裁切。"
        : s.fit === "contain"
          ? "完整保留画面，不拉伸。"
          : "填满视区，边缘内容可能被裁切。";

    $("media-badge").textContent =
      s.mediaType === "video" ? "MP4 / 视频" : s.mediaType === "image" ? "自定义图片" : "内置预设";
    $("active-media-name").textContent = media.mediaName || data.wallpaper || "Gemini Character Sheet";
    $("select-preset").hidden = s.mediaType === "preset";
    $("footer-title").textContent = media.mediaName || data.wallpaper || "Gemini Character Sheet";
    $("footer-sub").textContent =
      s.mediaType === "preset" ? "1672 × 941 · 原图完整保留" : s.customMediaPath || "自定义媒体文件";

    const showVideo = s.mediaType === "video" || media.mediaKind === "video";
    $("video-controls").hidden = !showVideo;
    $("videoMuted").checked = s.videoMuted !== false;
    $("videoPauseBtn").textContent = s.videoPaused ? "继续视频" : "暂停视频";
    $("videoPlaybackRate").value = String(s.videoPlaybackRate ?? 1);

    $("status").textContent = data.status.message;
    $("connection-title").textContent = data.status.applied
      ? "皮肤已应用"
      : data.status.connected
        ? "宿主已连接"
        : "等待宿主";
    $("dot").classList.toggle("active", data.status.connected);

    renderRecentChips();
    syncMediaElements();
  }

  function save(partial, message = "已保存") {
    pending = pending.then(async () => {
      try {
        data = await api.save(partial);
        $("saved").textContent = message;
        syncMediaElements();
        render();
      } catch (e) {
        $("saved").textContent = e.message;
      }
    });
    return pending;
  }

  $("pick-media").onclick = async () => {
    $("pick-media").disabled = true;
    try {
      const res = await api.pickMedia();
      if (res && res.state) {
        data = res.state;
        if (res.picked) $("saved").textContent = "已应用自定义背景";
        syncMediaElements();
        render();
      }
    } catch (e) {
      $("saved").textContent = e.message;
    } finally {
      $("pick-media").disabled = false;
    }
  };

  $("select-preset").onclick = async () => {
    try {
      data = await api.selectPreset();
      $("saved").textContent = "已恢复内置角色表";
      syncMediaElements();
      render();
    } catch (e) {
      $("saved").textContent = e.message;
    }
  };

  $("videoMuted").onchange = () => save({ videoMuted: $("videoMuted").checked });
  $("videoPauseBtn").onclick = () => save({ videoPaused: !data.settings.videoPaused });
  $("videoPlaybackRate").onchange = () => save({ videoPlaybackRate: Number($("videoPlaybackRate").value) });

  $("undo").onclick = () => {
    clearTimeout(timer);
    clearTimeout(panTimer);
    panTimer = null;
    draft = null;
    save(original, "已恢复到打开面板时");
  };
  $("defaults").onclick = () => {
    clearTimeout(timer);
    clearTimeout(panTimer);
    panTimer = null;
    draft = null;
    save(data.defaults, "已恢复默认，皮肤已关闭");
  };
  $("opacity").oninput = () => {
    const opacity = Number($("opacity").value);
    $("opacity-value").textContent = opacity + "%";
    $("wallpaper").style.opacity = String(opacity / 100);
    $("wallpaper-video").style.opacity = String(opacity / 100);
    save({ opacity });
  };
  document.querySelectorAll("[data-output-mode]").forEach((b) => {
    b.onclick = () => save({ outputMode: b.dataset.outputMode });
  });
  $("enabled").onchange = () => save({ enabled: $("enabled").checked });
  document.querySelectorAll("[data-fit]").forEach((b) => {
    b.onclick = () => save({ fit: b.dataset.fit });
  });
  $("scrim").oninput = () => {
    const scrim = Number($("scrim").value);
    $("scrim-value").textContent = scrim + "%";
    $("shade").style.opacity = String(scrim / 100);
    clearTimeout(timer);
    timer = setTimeout(() => save({ scrim }), 200);
  };
  $("scrim").onchange = () => {
    clearTimeout(timer);
    save({ scrim: Number($("scrim").value) });
  };
  $("restore").onclick = () => {
    clearTimeout(timer);
    save({ enabled: false });
  };
  $("refresh").onclick = async () => {
    data = await api.refresh();
    syncMediaElements();
    render();
  };
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => {
      $("stage").dataset.mode = b.dataset.mode;
      document
        .querySelectorAll("[data-mode]")
        .forEach((e) => e.setAttribute("aria-pressed", String(e === b)));
    };
  });

  function renderPosition(s = { ...data.settings, ...draft }) {
    const stage = $("stage");
    const mediaEl = activeMediaElement();
    const isVid = mediaEl.tagName === "VIDEO";
    const nw = isVid ? mediaEl.videoWidth : mediaEl.naturalWidth;
    const nh = isVid ? mediaEl.videoHeight : mediaEl.naturalHeight;
    if (!nw || !nh) return;
    const factor =
      (s.fit === "contain"
        ? Math.min(stage.clientWidth / nw, stage.clientHeight / nh)
        : Math.max(stage.clientWidth / nw, stage.clientHeight / nh)) * s.zoom;
    const w = nw * factor;
    const h = nh * factor;
    Object.assign(mediaEl.style, {
      width: w + "px",
      height: h + "px",
      left: ((stage.clientWidth - w) * s.positionX) / 100 + "px",
      top: ((stage.clientHeight - h) * s.positionY) / 100 + "px",
    });
  }

  for (const key of ["positionX", "positionY", "zoom"]) {
    $(key).oninput = () => save({ [key]: Number($(key).value) / (key === "zoom" ? 100 : 1) });
  }
  $("center").onclick = () => {
    clearTimeout(panTimer);
    panTimer = null;
    draft = null;
    save({ positionX: 50, positionY: 50, zoom: 1 });
  };

  const stage = $("stage");
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    clearTimeout(panTimer);
    panTimer = null;
    draft = { positionX: data.settings.positionX, positionY: data.settings.positionY };
    const mediaEl = activeMediaElement();
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      ...draft,
      extraX: mediaEl.offsetWidth - stage.clientWidth,
      extraY: mediaEl.offsetHeight - stage.clientHeight,
    };
    stage.setPointerCapture(e.pointerId);
    stage.dataset.dragging = "true";
  });

  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    draft = {
      positionX: Math.max(
        0,
        Math.min(100, drag.positionX - (Math.abs(drag.extraX) > 1 ? ((e.clientX - drag.x) / drag.extraX) * 100 : 0))
      ),
      positionY: Math.max(
        0,
        Math.min(100, drag.positionY - (Math.abs(drag.extraY) > 1 ? ((e.clientY - drag.y) / drag.extraY) * 100 : 0))
      ),
    };
    render();
    if (!panTimer) {
      panTimer = setTimeout(() => {
        panTimer = null;
        if (draft) save({ ...draft });
      }, 48);
    }
  });

  function finishPan() {
    if (!drag) return;
    drag = null;
    stage.dataset.dragging = "false";
    clearTimeout(panTimer);
    panTimer = null;
    const final = { ...draft };
    save(final).then(() => {
      draft = null;
      render();
    });
  }

  stage.addEventListener("pointerup", finishPan);
  stage.addEventListener("pointercancel", finishPan);
  stage.addEventListener("lostpointercapture", finishPan);

  $("wallpaper").addEventListener("load", () => renderPosition());
  $("wallpaper-video").addEventListener("loadedmetadata", () => renderPosition());
  new ResizeObserver(() => renderPosition()).observe(stage);

  api.subscribe((next) => {
    data = next;
    syncMediaElements();
    render();
  });
  syncMediaElements();
  render();
})();
