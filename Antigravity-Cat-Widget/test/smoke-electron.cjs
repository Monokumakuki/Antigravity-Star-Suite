// Smoke test for Electron main window lifecycle
// Launches Electron, ensures window creation, and shuts down cleanly.

const { app, BrowserWindow, screen } = require("electron");
const path = require("node:path");

app.whenReady().then(() => {
  console.log("[SmokeTest] Electron app ready. Testing window creation...");
  const primary = screen.getPrimaryDisplay();
  console.log("[SmokeTest] Primary display:", primary.bounds);

  const win = new BrowserWindow({
    width: 340,
    height: 450,
    frame: false,
    transparent: true,
    show: false, // Don't steal focus in automated test
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../src/main/preload.cjs")
    }
  });

  win.loadFile(path.join(__dirname, "../src/renderer/index.html"));

  win.webContents.on("did-finish-load", () => {
    console.log("[SmokeTest] Renderer loaded index.html successfully.");
    setTimeout(() => {
      console.log("[SmokeTest] Window lifecycle verified. Exiting cleanly.");
      win.close();
      app.quit();
    }, 500);
  });
});
