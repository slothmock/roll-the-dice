# Roll the Dice

**Discover electronic music. Rate what you hear. Refine what comes next.**

Roll the Dice is a Windows desktop music-discovery app built with Electron. It helps electronic-music listeners find tracks on SoundCloud, explore genre-specific releases, and refine recommendations using their ratings and favourite artists.

> **Status:** `1.0.0-alpha` — under active development. The current source configuration enables a friends-beta edition. This repository is not yet a turnkey public release.

## Features

- **Genre-based discovery:** Browse drum & bass, UK garage, house, techno, dubstep/140, breaks, trance and related subgenres.
- **Roll the Dice:** Discover tracks with a balance of personalised recommendations and randomness. Adjust the discovery/surprise setting.
- **Rate tracks:** Give tracks 1–5 stars to influence future recommendations, and undo a roll.
- **Music taste and favourites:** Set favourite genres and artist influences, and explore uploads from favourite SoundCloud profiles.
- **Embedded playback:** Listen through SoundCloud's embedded player. Protected playback depends on a compatible Electron for Content Security (ECS) runtime and successful component setup.
- **Download assistant:** Find artist-provided download destinations and open them in your browser. Downloads and any associated requirements remain with the original provider.
- **Hypeddit charts:** Browse charts in an embedded view, with an external-browser option. The dynamic genre selector depends on Hypeddit's current website structure.
- **Find similar:** Explore related tracks using listing details, subgenre signals, preferences and, where available, musical-key information.
- **Local preferences:** Keep ratings, favourite artists, genre preferences and discovery history locally, with backup and recovery handling where supported.

## How to use

1. Choose a genre and select **Roll the dice**.
2. Listen using the SoundCloud player and rate the track. Your feedback helps shape subsequent picks.
3. Explore favourite artists or use **Find similar** to discover related music.
4. For free downloads, use **Download assistant** to visit the artist's authorised destination and follow its instructions.

## Platform and architecture

Roll the Dice currently targets **Windows**. It is a local-first Electron application using plain JavaScript, HTML and CSS rather than a separate web frontend framework.

The application is divided into:

- `app/main.js` — Electron startup, windows, state and IPC handlers.
- `app/preload.js` — renderer-to-main-process API bridge.
- `app/core.js` — genre catalogue, search terms and recommendation weighting.
- `app/discovery.js` and `app/main/` — retrieval, filtering, chart handling and similarity search.
- `app/library.js` — persistence and recovery of local application data.
- `app/ui.js`, `app/renderer/`, `app/index.html`, `app/style.css` — interface and interactions.
- `app/assets/` — application artwork and icon.

Application data is stored locally in Electron’s user-data directory. The friends-beta edition uses a separate user-data profile from the standard edition. Back up your application data before testing new builds. The current data filename and migration behaviour should be confirmed against the latest source.

## Development

The supplied application source lives in `app/`. Its `package.json` identifies the Electron entry point as `main.js` but does not currently declare a full dependency installation, test or build workflow.

For development, use a compatible Electron runtime and launch the application from the `app/` directory. Do not assume that a standard Electron distribution will provide the protected-media capabilities of ECS.

A reproducible development and release toolchain, automated tests and CI are planned release work. Consult the repository's build tooling once those files are added; do not use an unsigned generic Electron build as a substitute for an ECS release requiring protected playback.

## Windows distribution and signing

The intended portable release pipeline is:

1. Prepare the correct **Electron for Content Security** runtime.
2. Assemble the application and `app.asar`, and finalise executable name, icon and Windows version resources.
3. **Authenticode-sign the final Windows executable** using a trusted code-signing service or certificate.
4. **CastLabs EVS/VMP-sign** the Authenticode-signed runtime/package.
5. Verify both signatures, smoke-test the packaged application and publish the release.

**Signing order matters:** Windows Authenticode signing must precede EVS/VMP signing. Changing the executable after VMP signing may invalidate the protected-playback signature.

The planned Authenticode provider is **Microsoft Azure Artifact Signing**, subject to publisher identity validation and certificate-profile approval. A deployed Azure resource alone does not mean that signing is operational.

## Privacy and external services

The app keeps its ratings and preferences locally. It accesses third-party services, including **SoundCloud** and **Hypeddit**, to discover and display music. Those services and any artist-hosted download destinations have their own terms and privacy practices.

Roll the Dice does **not** host or redistribute the music it discovers. A listing described as a free download does not guarantee that a file is currently available or that every use is licensed; check the artist's terms before downloading or using a track.

## Current limitations

- The project is **alpha software**; functionality and stored-data formats may change.
- Genre matching, third-party page extraction and chart links require ongoing validation as SoundCloud and Hypeddit evolve.

## Contributing and licence

Issues and constructive feedback are welcome during development. **No open-source licence is declared in the supplied source.** Until a licence is added, do not assume that permission to copy, modify or redistribute the code has been granted.

---

Roll the Dice is an independent application and is not affiliated with SoundCloud, Hypeddit or their respective owners.
