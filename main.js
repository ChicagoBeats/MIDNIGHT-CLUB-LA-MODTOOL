const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

let sess = null; // { kind: 'ps3' | 'raw' | 'xbox', file, dir, pfd }

function findPfd() {
  const cands = [
    path.join(process.resourcesPath || '', 'pfdtool'),
    process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'pfdtool'),
    path.join(path.dirname(process.execPath), 'pfdtool'),
    path.join(__dirname, 'vendor', 'pfdtool'),
    path.join(__dirname, 'pfdtool')
  ].filter(Boolean);
  for (const d of cands) {
    if (['pfdtool.exe', 'games.conf', 'global.conf'].every(f => fs.existsSync(path.join(d, f)))) return d;
  }
  return null;
}

function run(pfd, flag, target) {
  return new Promise(resolve => {
    execFile(path.join(pfd, 'pfdtool.exe'), [flag, target],
      { cwd: pfd, windowsHide: true, timeout: 180000 },
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

// A decrypted MCLA save starts 00 00 00 0E 00 00 00 09
const isPlain = b => b.length > 16 && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0x0e && b[7] === 0x09;
const magic = b => b.length > 4 ? b.slice(0, 4).toString('latin1') : '';

// Copy a save folder to a temp folder that keeps the SAME folder name, then decrypt it there.
async function workCopy(dir, pfd) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mcla-'));
  const sub = path.join(parent, path.basename(dir));
  copyDir(dir, sub);
  const r = await run(pfd, '-d', sub);
  return { parent, sub, log: r.out };
}

ipcMain.handle('save:open', async (e) => {
  const send = (pct, label) => e.sender.send('save:progress', { pct, label });
  const r = await dialog.showOpenDialog({
    title: 'Open your MCLA save (RAGE.SAV)',
    properties: ['openFile'],
    filters: [{ name: 'MCLA save', extensions: ['SAV', 'sav', 'RAV', 'rav'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const file = r.filePaths[0], dir = path.dirname(file);
  send(5, 'Reading file');
  const bytes = fs.readFileSync(file);
  if (['CON ', 'LIVE', 'PIRS'].includes(magic(bytes))) {
    sess = { kind: 'xbox', file };
    send(100, 'Xbox package loaded');
    return { kind: 'xbox', bytes };
  }
  if (isPlain(bytes)) {
    sess = { kind: 'raw', file };
    send(100, 'Save loaded (it was not encrypted)');
    return { kind: 'raw', bytes };
  }
  // Encrypted PS3 save
  if (!fs.existsSync(path.join(dir, 'PARAM.PFD')) || !fs.existsSync(path.join(dir, 'PARAM.SFO')))
    return { error: 'This file looks encrypted, but PARAM.PFD and PARAM.SFO are not in the same folder. Keep the whole save folder together.' };
  const pfd = findPfd();
  if (!pfd) return { error: 'pfdtool was not found inside the app. The build is missing the vendor/pfdtool files.' };
  send(15, 'Copying save to a work folder');
  send(30, 'Decrypting with pfdtool');
  const w = await workCopy(dir, pfd);
  const wf = path.join(w.sub, path.basename(file));
  const dec = fs.existsSync(wf) ? fs.readFileSync(wf) : Buffer.alloc(0);
  if (!isPlain(dec)) return { error: 'Decrypt did not work. pfdtool said: ' + (w.log || 'nothing').slice(0, 400), log: w.log };
  sess = { kind: 'ps3', file, dir, pfd };
  send(100, 'Decrypted and loaded');
  return { kind: 'ps3', bytes: dec, log: w.log };
});

ipcMain.handle('save:write', async (e, data) => {
  const send = (pct, label) => e.sender.send('save:progress', { pct, label });
  if (!sess) return { error: 'Open a save first.' };
  const bytes = Buffer.from(data);
  const stamp = Date.now();
  try {
    if (sess.kind !== 'ps3') {
      send(30, 'Making a backup');
      fs.copyFileSync(sess.file, sess.file + '.BACKUP_' + stamp);
      send(70, 'Writing file');
      fs.writeFileSync(sess.file, bytes);
      send(100, 'Saved');
      return { ok: true, backup: sess.file + '.BACKUP_' + stamp, log: '' };
    }
    const { dir, pfd, file } = sess, name = path.basename(file);
    send(5, 'Making a backup of your save folder');
    const backup = dir + '_BACKUP_' + stamp;
    copyDir(dir, backup);
    send(15, 'Preparing a work copy and decrypting it');
    const w = await workCopy(dir, pfd);
    send(40, 'Writing your edits');
    fs.writeFileSync(path.join(w.sub, name), bytes);
    send(50, 'Encrypting with pfdtool');
    const enc = await run(pfd, '-e', w.sub);
    const encBytes = fs.readFileSync(path.join(w.sub, name));
    if (isPlain(encBytes)) return { error: 'Encrypt did not run. Your save folder was NOT changed. pfdtool said: ' + enc.out.slice(0, 400), log: enc.out };
    send(70, 'Checking the encrypted result (decrypting a copy)');
    const chk = await workCopy(w.sub, pfd);
    const back = fs.readFileSync(path.join(chk.sub, name));
    const n = Math.min(back.length, bytes.length);
    if (n < 400000 || Buffer.compare(back.subarray(0, n), bytes.subarray(0, n)) !== 0)
      return { error: 'Check failed: the encrypted file did not decrypt back to your edits. Your save folder was NOT changed.', log: enc.out + '\n' + chk.log };
    send(90, 'Writing the encrypted save into your save folder');
    copyDir(w.sub, dir);
    send(100, 'Saved and encrypted');
    return { ok: true, backup, log: enc.out };
  } catch (err) {
    return { error: 'Save failed: ' + err.message };
  }
});


// ---- R35 mod installer: copies carchive_cache2.rpf into the game folder ----
function findGameRoot(start) {
  const has = d => { try { return fs.readdirSync(d).some(f => /^xarchive_.*\.rpf$/i.test(f)); } catch (_) { return false; } };
  const walk = (d, depth) => {
    if (has(d)) return d;
    if (depth === 0) return null;
    let subs = [];
    try { subs = fs.readdirSync(d, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => x.name); } catch (_) {}
    subs.sort((a, b) => (/^(PS3_GAME|USRDIR)$/i.test(b) ? 1 : 0) - (/^(PS3_GAME|USRDIR)$/i.test(a) ? 1 : 0));
    for (const s of subs) { const r = walk(path.join(d, s), depth - 1); if (r) return r; }
    return null;
  };
  return walk(start, 4);
}
ipcMain.handle('mod:install', async (e) => {
  const send = (pct, label) => e.sender.send('mod:progress', { pct, label });
  const a = await dialog.showOpenDialog({ title: 'Pick the R35 mod file (carchive_cache2.rpf)', properties: ['openFile'], filters: [{ name: 'RPF', extensions: ['rpf'] }] });
  if (a.canceled || !a.filePaths.length) return null;
  const srcFile = a.filePaths[0];
  const b = await dialog.showOpenDialog({ title: 'Pick your MCLA game folder (the one with PS3_GAME or the xarchive .rpf files)', properties: ['openDirectory'] });
  if (b.canceled || !b.filePaths.length) return null;
  send(2, 'Looking for the game folder');
  const root = findGameRoot(b.filePaths[0]);
  if (!root) return { error: 'I could not find the game files in that folder (no xarchive_*.rpf files within 4 levels). Pick the game folder that contains PS3_GAME, or the USRDIR folder itself. If your game is an ISO, it must be extracted first.' };
  const dest = path.join(root, 'carchive_cache2.rpf');
  try {
    const size = fs.statSync(srcFile).size;
    let backup = null;
    if (fs.existsSync(dest)) { backup = dest + '.BACKUP_' + Date.now(); send(5, 'Backing up the existing carchive_cache2.rpf'); fs.renameSync(dest, backup); }
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(srcFile), ws = fs.createWriteStream(dest);
      let n = 0;
      rs.on('data', c => { n += c.length; send(Math.min(95, 5 + Math.floor(n / size * 90)), 'Copying mod file: ' + Math.round(n / 1048576) + ' of ' + Math.round(size / 1048576) + ' MB'); });
      rs.on('error', reject); ws.on('error', reject); ws.on('finish', resolve);
      rs.pipe(ws);
    });
    send(97, 'Checking the copy');
    if (fs.statSync(dest).size !== size) return { error: 'The copy is the wrong size. Check free space on that drive and try again.' };
    send(100, 'Installed');
    return { ok: true, dest, backup };
  } catch (err) { return { error: 'Install failed: ' + err.message }; }
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
