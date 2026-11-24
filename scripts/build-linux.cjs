const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { version } = require('../app/package.json');

// Pinned to the Linux x64 asset and SHA-256 from the castLabs release.
const ecsVersion = '45.2.1+wvcus';
const expectedSha256 = '18953cdab1cdc2499f9b0089f85d069559bf992145008a40aacd0d7714b97960';

async function build() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw Error('Build the Linux x64 archive on x64 Linux.');
  }
  const { createPackage } = await import('@electron/asar');
  const root = path.resolve(__dirname, '..');
  const dist = path.join(root, 'dist');
  const name = `Roll-the-Dice-${version}-linux-x64`;
  fs.mkdirSync(dist, { recursive: true });
  const stage = fs.mkdtempSync(path.join(dist, '.linux-build-'));
  try {
    const zip = path.join(stage, 'electron.zip');
    const tag = encodeURIComponent(`v${ecsVersion}`);
    const url = `https://github.com/castlabs/electron-releases/releases/download/${tag}/electron-${tag}-linux-x64.zip`;
    execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '300', '--output', zip, url], { stdio: 'inherit' });
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(zip)) hash.update(chunk);
    if (hash.digest('hex') !== expectedSha256) throw Error('Linux ECS download failed SHA-256 verification.');

    const folder = path.join(stage, name);
    execFileSync('unzip', ['-q', zip, '-d', folder], { stdio: 'inherit' });
    fs.renameSync(path.join(folder, 'electron'), path.join(folder, 'roll-the-dice'));
    fs.rmSync(path.join(folder, 'resources', 'default_app.asar'));
    await createPackage(path.join(root, 'app'), path.join(folder, 'resources', 'app.asar'));

    const packed = path.join(stage, `${name}.tar.gz`);
    execFileSync('tar', ['-czf', packed, '-C', stage, name], { stdio: 'inherit' });
    const output = path.join(dist, `${name}.tar.gz`);
    fs.renameSync(packed, output);
    console.log('Built:', output);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

build().catch(error => { console.error(error.message); process.exitCode = 1; });
