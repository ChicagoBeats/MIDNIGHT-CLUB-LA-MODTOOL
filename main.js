const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

let work = null, srcDir = null, pfdDir = null;

function findPfd() {
  const cands = [
    process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'pfdtool'),
    path.join(path.dirname(process.execPath), 'pfdtool'),
    path.join(process.resourcesPath || '', 'pfdtool'),
    path.join(__dirname, 'pfdtool')
  ].filter(Boolean);
  for (const d of cands) {
    if (['pfdtool.exe', 'games.conf', 'global.conf'].every(f => fs.existsSync(path.join(d, f)))) return d;
  }
  return null;
}

function run(dir, flag, target) {
  return new Promise(resolve => {
    execFile(path.join(dir, 'pfdtool.exe'), [flag, target],
      { cwd: dir, windowsHide: true, timeout: 120000 },
      (err, stdout, stderr) => resolve({ err, out: (stdout || '') + (stderr || '') + (err ? '\n' + err.message : '') }));
  });
}

function copyDir(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const f of fs.readdirSync(a)) {
    const s = path.join(a, f);
    if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(b, f));
  }
}

ipcMain.handle('ps3:open', async () => {
  const dir = findPfd();
  if (!dir) return { error: 'pfdtool not found. Make a folder named "pfdtool" next to MCLA_ModTool_2.exe and put pfdtool.exe, games.conf and global.conf inside it.' };
  const r = await dialog.showOpenDialog({
    title: 'Select your PS3 save folder (the one with RAGE.SAV and PARAM.PFD)',
    properties: ['openDirectory']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const src = r.filePaths[0];
  if (!fs.existsSync(path.join(src, 'RAGE.SAV')) || !fs.existsSync(path.join(src, 'PARAM.PFD')))
    return { error: 'That folder does not contain RAGE.SAV and PARAM.PFD. Pick the save folder itself.' };
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'mcla-'));
  copyDir(src, w);
  const d = await run(dir, '-d', w);
  work = w; srcDir = src; pfdDir = dir;
  return { dir: src, bytes: fs.readFileSync(path.join(w, 'RAGE.SAV')), log: d.out };
});

ipcMain.handle('ps3:save', async (_e, bytes) => {
  if (!work) return { error: 'Open a PS3 save first.' };
  const backup = srcDir + '_BACKUP_' + Date.now();
  copyDir(srcDir, backup);
  fs.writeFileSync(path.join(work, 'RAGE.SAV'), Buffer.from(bytes));
  const r = await run(pfdDir, '-e', work);
  if (r.err) return { error: 'pfdtool could not encrypt the save: ' + r.out.slice(0, 300) };
  copyDir(work, srcDir);
  return { ok: true, backup };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 980, height: 920, autoHideMenuBar: true, title: 'MCLA ModTool 2',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
