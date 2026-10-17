const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcRenderer = path.join(root, 'src', 'renderer');
const outRenderer = path.join(root, 'dist', 'renderer');

fs.mkdirSync(outRenderer, { recursive: true });
for (const f of ['index.html', 'styles.css']) {
  const s = path.join(srcRenderer, f);
  const d = path.join(outRenderer, f);
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, d);
    console.log('copied ' + f + ' -> dist/renderer/');
  }
}
