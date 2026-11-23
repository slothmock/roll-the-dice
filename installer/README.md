# Windows MSI installer

## Build

```sh
npm run build:installer
```

This packages the existing `build/` directory; it does not rebuild or modify the app. The build verifies exact application-source/archive correspondence and the production streaming signature first. If the portable app is stale, run the normal application build separately.

Developer requirements: x64 Windows, Node.js with the project dependencies, .NET runtime 6 or newer, Windows PowerShell, and `uvx` for castLabs signature verification. No .NET SDK is required. WiX 5.0.2 and its matching UI extension are downloaded from NuGet into ignored `.installer-tools/`, checked against pinned SHA-256 hashes and unpacked into a fresh toolchain directory. The .NET compiler process explicitly permits major runtime roll-forward. First-time builds require network access. End users need neither Node.js nor .NET.

Output:

- `dist/Roll-the-Dice-<app-version>-x64.msi`
- A matching `.sha256` checksum file.
- `dist/installer-manifest.json`, containing every payload path, byte length and SHA-256.

## Installation contract

- Current user only; no machine-wide installer elevation request.
- Default program directory: `%LOCALAPPDATA%\Programs\Roll the Dice`.
- Dedicated Start-menu folder and shortcut; Apps / Installed apps registration and uninstall support.
- Library/settings remain in `%APPDATA%\roll-the-dice-desktop`, outside MSI ownership. Uninstall never deletes that profile or the retained legacy profile.
- Only installer-managed files and empty owned directories are removed. Unrelated files placed in the program directory are retained.
- The separately installed original application under `Programs\roll-the-dice` is not the install destination.
- The existing signed Electron executable and companion `.exe.sig` are copied byte-for-byte. This streaming signature is not Windows Authenticode signing. The MSI itself is currently unsigned and can display an unknown-publisher warning.
- No auto-launch or auto-update is introduced.

## Versioning and upgrades

The visible release label and MSI filename use `app/package.json`, not the development workspace package version. Windows Installer requires a numeric version, so `1.0.0-alpha` becomes MSI version `1.0.0`; the app remains `1.0.0-alpha`.

The desktop installer has its own stable upgrade code, separate from the original installation. Same-numeric-version replacement is allowed so prerelease builds can replace earlier prereleases; increment the numeric app version for normal releases. Keep the upgrade code stable. Product/component identities and upgrade behavior are installer concerns, not a user-library schema migration.

## Verify

```sh
npm run verify:installer
```

This is a **real transient Windows Installer install/repair/uninstall**, not merely archive extraction. It refuses to run if a related desktop MSI is already registered. It redirects `INSTALLFOLDER` and `APPLICATIONSHORTCUTDIR` to UUID scratch locations, leaving the default program/Start-menu destinations alone. It briefly creates its own current-user Apps registration and removes it afterwards.

Checks include per-user/no-elevation MSI metadata, wizard dialogs, every installed payload byte, shortcut targeting, Apps registration, launch with an explicit disposable library profile, repair after deleting a managed file, uninstall, retention of unrelated files/library data and registration cleanup. MSI logs stay in private scratch; the summary is `evidence/installer-verification.json`.

Use this only when local installation testing is appropriate. Never force-remove an existing desktop installation to make the verifier run. The author's existing portable app and its real library do not need to be closed or replaced.
