const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { version } = require('../app/package.json');

const root = path.resolve(__dirname, '..');

test('build:linux produces a portable x64 ECS archive with the current app', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async () => {
  const name = `Roll-the-Dice-${version}-linux-x64`;
  const archive = path.join(root, 'dist', `${name}.tar.gz`);
  execFileSync('npm', ['run', 'build:linux'], { cwd: root, stdio: 'inherit' });

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'roll-dice-test-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', work]);
    assert.deepEqual(fs.readdirSync(work), [name]);
    const folder = path.join(work, name);
    const electron = path.join(folder, 'roll-the-dice');
    fs.accessSync(electron, fs.constants.X_OK);
    const fd = fs.openSync(electron, 'r');
    const header = Buffer.alloc(20);
    try { fs.readSync(fd, header); }
    finally { fs.closeSync(fd); }
    assert.equal(header.subarray(0, 4).toString('hex'), '7f454c46');
    assert.equal(header[4], 2); // ELF64
    assert.equal(header.readUInt16LE(18), 62); // x86-64
    assert.match(fs.readFileSync(path.join(folder, 'version'), 'utf8').trim(), /\+wvcus$/);
    assert.equal(fs.existsSync(path.join(folder, 'resources/default_app.asar')), false);
    const { extractFile } = await import('@electron/asar');
    const appAsar = path.join(folder, 'resources/app.asar');
    for (const file of ['package.json', 'main.js', 'index.html', 'assets/icon.png']) {
      assert.deepEqual(extractFile(appAsar, file), fs.readFileSync(path.join(root, 'app', file)));
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
