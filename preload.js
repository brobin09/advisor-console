const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ac", {
  startup: () => ipcRenderer.invoke("caseload:startup"),
  createCaseload: () => ipcRenderer.invoke("caseload:create"),
  openCaseload: () => ipcRenderer.invoke("caseload:open"),
  writeCaseload: (d) => ipcRenderer.invoke("caseload:write", d),
  flushSync: (d) => ipcRenderer.sendSync("caseload:writeSync", d),
  revealCaseload: () => ipcRenderer.invoke("caseload:reveal"),
  importStudent: () => ipcRenderer.invoke("student:import"),
  exportStudent: (p) => ipcRenderer.invoke("export:student", p),
  importPdf: () => ipcRenderer.invoke("import:pdf"),
  exportPdf: (n) => ipcRenderer.invoke("export:pdf", n),
  exportXlsx: (p) => ipcRenderer.invoke("export:xlsx", p),
  print: () => ipcRenderer.invoke("app:print"),
});
