const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcRenderer = path.join(root, 'src', 'renderer');
const outRenderer = path.join(root, 'dist', 'renderer');

fs.mkdirSync(outRenderer, { recursive: true });
// ASET SAJA — jangan copy .js dari src (renderer.js kini hasil tsc renderer).
for (const f of ['index.html', 'styles.css']) {
  const s = path.join(srcRenderer, f);
  const d = path.join(outRenderer, f);
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, d);
    console.log('copied ' + f + ' -> dist/renderer/');
  }
}
// Hapus sisa renderer.js basi dari era CommonJS bila masih ada & lebih tua dari hasil tsc.
try {
  const stale = path.join(srcRenderer, 'renderer.js');
  if (fs.existsSync(stale)) {
    fs.unlinkSync(stale);
    console.log('removed stale src/renderer/renderer.js');
  }
} catch (e) {
  console.log('skip stale cleanup: ' + e);
}
