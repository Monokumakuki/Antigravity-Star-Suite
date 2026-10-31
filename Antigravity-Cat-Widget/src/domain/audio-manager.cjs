// Production Audio Manager for Antigravity Cat Widget
// Resolves presets from assets/audio/codex-maid-widget/manifest.json

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

class AudioManager {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.resolve(__dirname, "../..");
    this.audioBaseDir = path.join(this.rootDir, "assets/audio/codex-maid-widget");
    this.manifestPath = path.join(this.audioBaseDir, "manifest.json");
    this.manifest = this._loadManifest();
    
    this.enabled = Boolean(options.enabled ?? this.manifest.defaultEnabled ?? false);
    this.volume = Number(options.volume ?? this.manifest.defaultVolume ?? 0.35);
    this.currentPreset = options.preset || this.manifest.defaultPreset || "bubble-pop";
    
    // Cooldown management to prevent audio pile-up on rapid clicking
    this.lastPlayTime = 0;
    this.minIntervalMs = 60; 
  }

  _loadManifest() {
    try {
      if (fs.existsSync(this.manifestPath)) {
        return JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
      }
    } catch (err) {
      console.warn("[AudioManager] Failed to load audio manifest:", err.message);
    }
    return { presets: [], defaultPreset: "bubble-pop", defaultEnabled: false };
  }

  getPresetList() {
    return (this.manifest.presets || []).map(p => ({
      id: p.id,
      label: p.label,
      gain: p.gain
    }));
  }

  getAudioFile(type = "press", presetId = null) {
    if (!this.enabled) return null;

    const targetPreset = presetId || this.currentPreset;
    const preset = (this.manifest.presets || []).find(p => p.id === targetPreset);
    if (!preset) return null;

    const relFile = type === "release" ? preset.release : preset.press;
    if (!relFile) return null;

    const absPath = path.join(this.audioBaseDir, relFile);
    if (!fs.existsSync(absPath)) {
      console.warn(`[AudioManager] Audio file missing on disk: ${absPath}`);
      return null;
    }

    return {
      filePath: absPath,
      url: pathToFileURL(absPath).href,
      gain: preset.gain ?? 1.0,
      effectiveVolume: Math.max(0, Math.min(1, this.volume * (preset.gain ?? 1.0)))
    };
  }

  setPreset(id) {
    const exists = (this.manifest.presets || []).some(p => p.id === id);
    if (exists) {
      this.currentPreset = id;
      return true;
    }
    return false;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, Number(vol) || 0));
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }
}

module.exports = { AudioManager };
