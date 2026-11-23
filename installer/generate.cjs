'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function xmlAttribute(value) {
  return String(value).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;').split("'").join('&apos;');
}
const digits = text => text.length > 0 && [...text].every(c => c >= '0' && c <= '9');
function parseVersion(version) {
  const invalid = () => { throw new Error('Invalid MSI/semantic version'); };
  if (typeof version !== 'string') invalid();
  const plus = version.split('+');
  if (plus.length > 2) invalid();
  const dash = plus[0].indexOf('-');
  const core = dash < 0 ? plus[0] : plus[0].slice(0, dash);
  const nums = core.split('.');
  if (nums.length !== 3 || nums.some((s, i) => !digits(s) || (s.length > 1 && s[0] === '0') || Number(s) > [255, 255, 65535][i])) invalid();
  function identifiers(text, prerelease) {
    for (const token of text.split('.')) {
      if (!token || ![...token].every(c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-')) invalid();
      if (prerelease && digits(token) && token.length > 1 && token[0] === '0') invalid();
    }
  }
  if (dash >= 0) identifiers(plus[0].slice(dash + 1), true);
  if (plus.length === 2) identifiers(plus[1], false);
  return core;
}
function validateUpgradeCode(code) {
  const value = typeof code === 'string' && code.startsWith('{') && code.endsWith('}') ? code.slice(1, -1) : code;
  const parts = typeof value === 'string' ? value.split('-') : [];
  if (parts.length !== 5 || parts.some((p, i) => p.length !== [8, 4, 4, 4, 12][i] || ![...p].every(c => '0123456789abcdefABCDEF'.includes(c)))) throw new Error('Invalid upgradeCode GUID');
}
function safeSourcePath(source) {
  if (typeof source !== 'string' || !source || source.split('\\').join('/').split('/').includes('..')) throw new Error('Source path traversal is forbidden');
  if (source.includes('$(') || source.includes('!(') || [...source].some(c => c.charCodeAt(0) < 32)) throw new Error('Unsafe source path');
  // Check every ancestor, not just the final leaf: directory junctions escape payload roots too.
  let current = path.resolve(source);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symlink/reparse source forbidden');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function safeName(name) {
  const base = name.split('.')[0].toUpperCase();
  if (!name || name === '.' || name === '..' || name.endsWith('.') || name.endsWith(' ') || [...name].some(c => c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c)) || ['CON', 'PRN', 'AUX', 'NUL', ...Array.from({length: 9}, (_, i) => `COM${i + 1}`), ...Array.from({length: 9}, (_, i) => `LPT${i + 1}`)].includes(base)) throw new Error('Unsafe payload path name');
}
function createInstaller({ portableDir, iconPath, version, upgradeCode }) {
  const msiVersion = parseVersion(version);
  validateUpgradeCode(upgradeCode);
  safeSourcePath(portableDir);
  safeSourcePath(iconPath);
  if (!fs.statSync(portableDir).isDirectory() || !fs.statSync(iconPath).isFile() || !fs.statSync(iconPath).size) throw new Error('Missing payload directory or icon');
  const files = [];
  const seen = new Set();
  const profileNames = new Set(['user data', 'userdata', 'appdata', 'localappdata', 'roll-the-dice-desktop', 'roll-the-dice-friends-beta']);
  function walk(relative) {
    for (const name of fs.readdirSync(path.join(portableDir, relative)).sort()) {
      safeName(name);
      if (profileNames.has(name.toLowerCase()) || ['crate.json', 'crate.json.bak', 'cookies', 'login data', 'local state'].includes(name.toLowerCase())) throw new Error('User profile data cannot be installed');
      const entry = relative ? `${relative}/${name}` : name;
      if (seen.has(entry.toLowerCase())) throw new Error('Case-insensitive payload path collision');
      seen.add(entry.toLowerCase());
      const source = path.join(portableDir, entry);
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink()) throw new Error('Symlink/reparse payload forbidden');
      safeSourcePath(source);
      if (stat.isDirectory()) walk(entry);
      else if (stat.isFile()) {
        const data = fs.readFileSync(source);
        files.push({ path: entry, sha256: hash(data), size: data.length });
      } else throw new Error('Unsupported payload filesystem entry');
    }
  }
  walk('');
  for (const required of ['Roll the Dice.exe', 'Roll the Dice.exe.sig', 'resources/app.asar']) {
    if (!files.some(f => f.path === required && f.size > 0)) throw new Error(`Missing or empty required payload: ${required}`);
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const directories = new Map([['', 'INSTALLFOLDER']]);
  for (const file of files) {
    const parts = file.path.split('/');
    parts.pop();
    let relative = '';
    for (const part of parts) {
      relative = relative ? `${relative}/${part}` : part;
      directories.set(relative, `d_${hash(relative.toLowerCase())}`);
    }
  }
  const registry = (id, name) => `<RegistryValue Root="HKCU" Key="Software\\RollTheDiceDesktop\\Installer\\${name}" Name="Installed" Type="integer" Value="1" KeyPath="yes" />`;
  const componentIds = [];
  function directoryContents(relative) {
    let body = '';
    for (const [dir, id] of directories) {
      if (dir && path.posix.dirname(dir) === (relative || '.')) body += `<Directory Id="${id}" Name="${xmlAttribute(path.posix.basename(dir))}">${directoryContents(dir)}</Directory>\n`;
    }
    for (const file of files.filter(f => path.posix.dirname(f.path) === (relative || '.'))) {
      const suffix = hash(file.path.toLowerCase());
      const id = `c_${suffix}`;
      componentIds.push(id);
      const digest = hash(`RollTheDiceDesktop:installer:${upgradeCode.toUpperCase()}:${file.path.toLowerCase()}`);
      // Stable UUID-shaped component identity; set RFC 4122 variant/version bits.
      const guid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
      body += `<Component Id="${id}" Guid="${guid}" Bitness="always64"><File Id="f_${suffix}" Source="${xmlAttribute(path.resolve(portableDir, file.path))}" Name="${xmlAttribute(path.posix.basename(file.path))}" KeyPath="no" />${registry(id, `Files\\${suffix}`)}</Component>\n`;
    }
    return body;
  }
  const payload = directoryContents('');
  const cleanup = [...directories].reverse().map(([dir, id]) => `<RemoveFolder Id="r_${id}" Directory="${id}" On="uninstall" />`).join('\n');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
<Package Name="Roll the Dice" Manufacturer="Roll the Dice" Version="${msiVersion}" UpgradeCode="${xmlAttribute(upgradeCode)}" Scope="perUser" InstallerVersion="500" Language="1033">
<MajorUpgrade AllowSameVersionUpgrades="yes" Schedule="afterInstallInitialize" DowngradeErrorMessage="A newer version of Roll the Dice is already installed." />
<MediaTemplate EmbedCab="yes" CompressionLevel="high" />
<Icon Id="AppIcon" SourceFile="${xmlAttribute(path.resolve(iconPath))}" />
<Property Id="ARPDisplayIcon" Value="AppIcon" />
<Property Id="ARPNOMODIFY" Value="1" />
<StandardDirectory Id="LocalAppDataFolder"><Directory Id="UserPrograms" Name="Programs"><Directory Id="INSTALLFOLDER" Name="Roll the Dice">
${payload}
<Component Id="OwnedDirectoryCleanup" Guid="*" Bitness="always64">${cleanup}${registry('OwnedDirectoryCleanup', 'Cleanup')}</Component>
</Directory></Directory></StandardDirectory>
<StandardDirectory Id="ProgramMenuFolder"><Directory Id="APPLICATIONSHORTCUTDIR" Name="Roll the Dice">
<Component Id="AppShortcut" Guid="*" Bitness="always64">
<Shortcut Id="StartMenuShortcut" Name="Roll the Dice" Target="[INSTALLFOLDER]Roll the Dice.exe" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon" Advertise="no"><ShortcutProperty Key="System.AppUserModel.ID" Value="app.rollthedice.desktop" /></Shortcut>
<RemoveFolder Id="RemoveShortcutDirectory" On="uninstall" />${registry('AppShortcut', 'Shortcut')}
</Component></Directory></StandardDirectory>
<Feature Id="Application" Title="Roll the Dice" Level="1">${componentIds.concat(['OwnedDirectoryCleanup', 'AppShortcut']).map(id => `<ComponentRef Id="${id}" />`).join('')}</Feature>
<UIRef Id="RollDiceSetupUI" />
</Package></Wix>\n`;
  return { xml, files, msiVersion };
}
module.exports = { createInstaller };
