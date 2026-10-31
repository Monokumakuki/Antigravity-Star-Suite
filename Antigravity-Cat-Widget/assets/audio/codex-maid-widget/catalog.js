window.AgyMaidAudioManifest = {
  "schemaVersion": 1,
  "sourceProject": "codex-maid-widget",
  "sourceVersion": "0.3.51",
  "sourceUrl": "https://github.com/Feeesack/codex-maid-widget",
  "coverage": "Public export: four licensed pairs from installed upstream 0.3.51; DSH pair excluded.",
  "defaultPreset": "bubble-pop",
  "defaultEnabled": false,
  "defaultVolume": 0.35,
  "userAuthorizedLocalUse": true,
  "redistribution": "Keep upstream notices; DSH duck pair has no independently verified redistribution grant.",
  "unchangedSourceBytes": true,
  "presets": [
    {
      "id": "bubble-pop",
      "label": "气泡轻弹",
      "gain": 0.5,
      "rights": "CC0-1.0",
      "press": "files/bubble-pop-press.wav",
      "release": "files/bubble-pop-release.wav"
    },
    {
      "id": "soft-spring",
      "label": "轻柔弹簧",
      "gain": 0.5,
      "rights": "CC0-1.0",
      "press": "files/interaction-press.wav",
      "release": "files/interaction-release.wav"
    },
    {
      "id": "original",
      "label": "经典啾啾",
      "gain": 1,
      "rights": "MIT",
      "press": "files/original-press.wav",
      "release": "files/original-release.wav"
    },
    {
      "id": "wood-tap",
      "label": "木质轻敲",
      "gain": 0.5,
      "rights": "CC0-1.0",
      "press": "files/wood-tap-press.wav",
      "release": "files/wood-tap-release.wav"
    }
  ],
  "files": [
    {
      "path": "files/bubble-pop-press.wav",
      "bytes": 10606,
      "sha256": "94b34167da2c846e3ea6b4d5c33eb93e2ed284556d30bcb15ce8155a911aa857",
      "sourceFile": "assets/audio/bubble-pop-press.wav"
    },
    {
      "path": "files/bubble-pop-release.wav",
      "bytes": 16816,
      "sha256": "1d7013323198e65c58ae525557e1bbcdf04c68fceb8be2d897377a9a75008880",
      "sourceFile": "assets/audio/bubble-pop-release.wav"
    },
    {
      "path": "files/interaction-press.wav",
      "bytes": 13470,
      "sha256": "d82391669c399d0be5b4826f2e702b6c39a4ffad4894e37e682ee3f08cddf90d",
      "sourceFile": "assets/audio/interaction-press.wav"
    },
    {
      "path": "files/interaction-release.wav",
      "bytes": 13470,
      "sha256": "d96d217acf9abd603ed249d1884528134f3be21f2a2af3bb4da26db506344d92",
      "sourceFile": "assets/audio/interaction-release.wav"
    },
    {
      "path": "files/original-press.wav",
      "bytes": 4454,
      "sha256": "4800799d66f3280bc9ab0f0969aa4ad95864d10b598810261f2891c2664053d3",
      "sourceFile": "assets/audio/original-press.wav"
    },
    {
      "path": "files/original-release.wav",
      "bytes": 18566,
      "sha256": "16a9a06efc11f213b09a6bc72930feece0fa42a6bdff30504f1278df29b15821",
      "sourceFile": "assets/audio/original-release.wav"
    },
    {
      "path": "files/wood-tap-press.wav",
      "bytes": 12636,
      "sha256": "ebc0ea13a39b6f939f3ebf9de72ea87e1ecc5956e7dd4cb5c6796c31e7e4426e",
      "sourceFile": "assets/audio/wood-tap-press.wav"
    },
    {
      "path": "files/wood-tap-release.wav",
      "bytes": 16234,
      "sha256": "8ecd8cc6ca03e479bc811cb12a1f5811a6f898dd32b2ff78962d50156936cec4",
      "sourceFile": "assets/audio/wood-tap-release.wav"
    }
  ],
  "playback": {
    "events": [
      "press",
      "release"
    ],
    "autoplay": false,
    "stopOnMute": true,
    "maxVoices": 2,
    "note": "Production playback scheduling and OS audio behavior belong to Gemini; do not invent extra completion sounds."
  },
  "publicDistribution": "DSH duck audio excluded: independent redistribution permission unverified."
};
