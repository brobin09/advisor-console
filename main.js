const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let win = null;
let caseloadPath = null;   // the open caseload file; single source of truth

/* ---------------- settings (remembers last caseload path only) ---------------- */
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), "utf-8")); }
  catch (e) { return {}; }
}
function saveSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

/* ---------------- caseload file ops ---------------- */
function readCaseload(p) {
  const raw = fs.readFileSync(p, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.advisees)) throw new Error("Not a caseload file");
  return data;
}

function writeCaseload(data) {
  if (!caseloadPath) return { ok: false, error: "No caseload file open" };
  const payload = Object.assign(
    { _kind: "nccu-advisor-caseload", _saved: new Date().toISOString() },
    data
  );
  // atomic write: temp file then rename, so a crash never corrupts the caseload
  const tmp = caseloadPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, caseloadPath);
  return { ok: true, path: caseloadPath };
}

/* ---------------- IPC ---------------- */
ipcMain.handle("caseload:startup", () => {
  // reopen last caseload automatically if it still exists
  const s = loadSettings();
  if (s.lastCaseload && fs.existsSync(s.lastCaseload)) {
    try {
      const data = readCaseload(s.lastCaseload);
      caseloadPath = s.lastCaseload;
      return { ok: true, path: caseloadPath, data };
    } catch (e) { /* fall through to no-file state */ }
  }
  return { ok: false };
});

ipcMain.handle("caseload:create", async () => {
  const r = await dialog.showSaveDialog(win, {
    title: "Create Caseload File",
    defaultPath: path.join(app.getPath("documents"), "advising-caseload.json"),
    filters: [{ name: "Advising Caseload", extensions: ["json"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  caseloadPath = r.filePath;
  const data = { advisees: [] };
  writeCaseload(data);
  saveSettings(Object.assign(loadSettings(), { lastCaseload: caseloadPath }));
  return { ok: true, path: caseloadPath, data };
});

ipcMain.handle("caseload:open", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Open Caseload File",
    properties: ["openFile"],
    filters: [{ name: "Advising Caseload", extensions: ["json"] }],
  });
  if (r.canceled || !r.filePaths.length) return { ok: false };
  try {
    const data = readCaseload(r.filePaths[0]);
    caseloadPath = r.filePaths[0];
    saveSettings(Object.assign(loadSettings(), { lastCaseload: caseloadPath }));
    return { ok: true, path: caseloadPath, data };
  } catch (e) {
    return { ok: false, error: "That file isn't a valid caseload: " + e.message };
  }
});

ipcMain.handle("caseload:write", (e, data) => {
  try { return writeCaseload(data); }
  catch (err) { return { ok: false, error: err.message }; }
});

/* Synchronous write, used on window close. A debounced async save can be
   lost if the app quits before it fires; this guarantees the last change
   reaches disk. */
ipcMain.on("caseload:writeSync", (e, data) => {
  try { writeCaseload(data); e.returnValue = true; }
  catch (err) { e.returnValue = false; }
});

ipcMain.handle("caseload:reveal", () => {
  if (caseloadPath) shell.showItemInFolder(caseloadPath);
});

ipcMain.handle("student:import", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Import Student File",
    properties: ["openFile"],
    filters: [{ name: "Student File", extensions: ["json"] }],
  });
  if (r.canceled || !r.filePaths.length) return { ok: false };
  try {
    const data = JSON.parse(fs.readFileSync(r.filePaths[0], "utf-8"));
    // Full advisee backup (student record + advisor notes) written by this app
    if (data && data._kind === "nccu-advisee" && data.student) {
      return { ok: true, advisee: data, filename: path.basename(r.filePaths[0]) };
    }
    // Degree Path export from the student
    if (!data.courses || !data.info) throw new Error("Not a Degree Path export or student backup file");
    return { ok: true, data, filename: path.basename(r.filePaths[0]) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/* Save one student to their own named file (student record + advisor notes).
   Doubles as a backup: it re-imports through "Import Student File". */
ipcMain.handle("export:student", async (e, payload) => {
  const r = await dialog.showSaveDialog(win, {
    title: "Save Student as a File",
    defaultPath: path.join(app.getPath("documents"), payload.suggestedName || "student.json"),
    filters: [{ name: "Student File", extensions: ["json"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  try {
    fs.writeFileSync(r.filePath, JSON.stringify(payload.data, null, 2));
    return { ok: true, path: r.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("app:print", () => { win.webContents.print({}); });

/* ---------------- exports: PDF + Excel ---------------- */
ipcMain.handle("export:pdf", async (e, suggestedName) => {
  const r = await dialog.showSaveDialog(win, {
    title: "Export Advising Summary as PDF",
    defaultPath: path.join(app.getPath("documents"), suggestedName || "advising-summary.pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  try {
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "Letter",
      margins: { marginType: "custom", top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });
    fs.writeFileSync(r.filePath, data);
    return { ok: true, path: r.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("export:xlsx", async (e, payload) => {
  // payload: { suggestedName, buffer: number[] }  (workbook built in renderer via SheetJS)
  const r = await dialog.showSaveDialog(win, {
    title: "Export Advising Summary as Excel",
    defaultPath: path.join(app.getPath("documents"), payload.suggestedName || "advising-summary.xlsx"),
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  try {
    fs.writeFileSync(r.filePath, Buffer.from(payload.buffer));
    return { ok: true, path: r.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("import:pdf", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Import DegreeWorks Audit PDF",
    properties: ["openFile"],
    filters: [{ name: "DegreeWorks Audit", extensions: ["pdf"] }],
  });
  if (r.canceled || !r.filePaths.length) return { ok: false };
  try {
    const buf = fs.readFileSync(r.filePaths[0]);
    return { ok: true, buffer: Array.from(buf), filename: path.basename(r.filePaths[0]) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ---------------- window ---------------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    title: "Advisor Console",
    backgroundColor: "#5E1A24",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
