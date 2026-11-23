const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function verifyRuntime(folder) {
  const result = spawnSync('uvx', ['--from', 'castlabs-evs', 'evs-vmp', '--no-ask', 'verify-pkg', folder], { stdio: 'inherit' });
  if (result.error) throw Error('Could not run EVS signature verification. Install uv and the castlabs-evs client.');
  if (result.status !== 0) throw Error('A valid production streaming signature is required. Sign the ECS runtime with castLabs EVS before building.');
}

(async () => {
  const { createPackage } = await import('@electron/asar');
  const root = path.resolve(__dirname, '..');
  const runtime = process.env.ROLL_DICE_RUNTIME || path.join(root, 'runtime');
  const target = path.join(root, 'build');
  const previous = path.join(root, 'build.previous');
  for (const name of ['version', 'electron.exe', 'electron.exe.sig']) {
    if (!fs.existsSync(path.join(runtime, name))) throw Error('Signed ECS runtime not found. See README.md or set ROLL_DICE_RUNTIME to its folder.');
  }
  verifyRuntime(runtime);
  const stage = fs.mkdtempSync(path.join(root, '.app-build-'));
  try {
    fs.cpSync(runtime, stage, {
      recursive: true,
      filter: file => !['app.asar', 'default_app.asar', 'debug.log', 'electron.exe', 'electron.exe.sig'].includes(path.basename(file))
    });
    fs.copyFileSync(path.join(runtime, 'electron.exe'), path.join(stage, 'Roll the Dice.exe'));
    fs.copyFileSync(path.join(runtime, 'electron.exe.sig'), path.join(stage, 'Roll the Dice.exe.sig'));
    await createPackage(path.join(root, 'app'), path.join(stage, 'resources/app.asar'));
    verifyRuntime(stage);
    if (fs.existsSync(previous)) fs.rmSync(previous, { recursive: true, force: true });
    if (fs.existsSync(target)) fs.renameSync(target, previous);
    try { fs.renameSync(stage, target); }
    catch (error) {
      if (fs.existsSync(previous) && !fs.existsSync(target)) fs.renameSync(previous, target);
      throw error;
    }
    console.log('Built:', path.join(target, 'Roll the Dice.exe'));
    console.log('Electron:', fs.readFileSync(path.join(target, 'version'), 'utf8').trim());
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

