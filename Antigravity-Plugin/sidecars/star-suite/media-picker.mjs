import { execFile } from "node:child_process";

const WIN32_PICKER_SCRIPT = [
  "$ProgressPreference = 'SilentlyContinue'",
  "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
  "Add-Type -AssemblyName System.Windows.Forms",
  "Add-Type -AssemblyName System.Drawing",
  "$owner = New-Object System.Windows.Forms.Form",
  "$owner.TopMost = $true",
  "$owner.ShowInTaskbar = $false",
  "$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None",
  "$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual",
  "$owner.Opacity = 0",
  "$owner.Size = New-Object System.Drawing.Size(1, 1)",
  "$owner.Location = New-Object System.Drawing.Point(-32000, -32000)",
  "$dlg = New-Object System.Windows.Forms.OpenFileDialog",
  "$dlg.Title = '选择织梦皮肤背景（MP4 / WEBM / 图片）'",
  "$dlg.Filter = '图片与视频 (*.mp4;*.webm;*.png;*.jpg;*.jpeg;*.webp;*.gif)|*.mp4;*.webm;*.png;*.jpg;*.jpeg;*.webp;*.gif|视频 (*.mp4;*.webm)|*.mp4;*.webm|图片 (*.png;*.jpg;*.jpeg;*.webp;*.gif)|*.png;*.jpg;*.jpeg;*.webp;*.gif|所有文件 (*.*)|*.*'",
  "$dlg.CheckFileExists = $true",
  "$dlg.Multiselect = $false",
  "try { $owner.Show(); $owner.Activate(); if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dlg.FileName) } } finally { $dlg.Dispose(); $owner.Dispose() }",
].join("; ");

export function buildWin32PickerArgs() {
  const encoded = Buffer.from(WIN32_PICKER_SCRIPT, "utf16le").toString("base64");
  return ["-NoProfile", "-STA", "-NonInteractive", "-EncodedCommand", encoded];
}

function runPicker(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "utf8", timeout: 600000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        // User canceled dialog returns non-zero in zenity/osascript
        if (err.code === 1 && !String(stderr || "").trim()) {
          resolve(null);
          return;
        }
        reject(new Error(String(stderr || err.message || "打开文件选择器失败").trim()));
        return;
      }
      const picked = String(stdout || "").replace(/^\uFEFF/, "").trim();
      resolve(picked || null);
    });
  });
}

export async function pickLocalMediaFile() {
  if (process.platform === "win32") {
    return runPicker("powershell.exe", buildWin32PickerArgs());
  }
  if (process.platform === "darwin") {
    return runPicker("osascript", [
      "-e",
      'POSIX path of (choose file with prompt "选择织梦皮肤背景" of type {"public.movie", "public.image"})',
    ]);
  }
  return runPicker("zenity", [
    "--file-selection",
    "--title=选择织梦皮肤背景",
    "--file-filter=Media | *.mp4 *.webm *.png *.jpg *.jpeg *.webp *.gif",
  ]);
}
