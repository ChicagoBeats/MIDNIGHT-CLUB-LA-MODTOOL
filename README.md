# MCLA ModTool 2

A browser-based customization editor for **Midnight Club: Los Angeles** save files, a from-scratch successor to Jakes625's MCLA ModTool v1.2 (2013). Single file, no install, nothing is uploaded: open `index.html`, or use the GitHub Pages site once deployed.

## Features
- Opens Xbox 360 `mc4.sav` packages (STFS) or decrypted raw save data (`RAGE.SAV`)
- Per-car wheels and tires: ride height, tire width, rim size (signed byte, so well past 28"), tire profile, rim type, tire type (thin, invisible, bike, white and more)
- 19 light entries per car: front/rear colour, brightness, mode ID; low and high beam brightness helpers; rainbow flashing preset
- Experimental toggles (spinner guess, orbiting tires) marked as unconfirmed
- Revert a car to how it loaded; download the modified save

## Using it
- **Xbox 360:** open the package, edit, download, then Rehash and Resign it (e.g. with Modio) before copying to the console.
- **PS3:** saves are encrypted with PFD. Decrypt `RAGE.SAV` first (for example with Flatz's `pfdtool -d <save folder>` and the game's secure file ID), edit it here, replace the file, then re-encrypt with `pfdtool -e`. Binaries and keys are intentionally not included in this repo.

## Status
Wheel layout and the light-entry layout were verified against real saves. Whether an exact value does what the label says in game is **untested**. See [docs/SAVE_FORMAT.md](docs/SAVE_FORMAT.md). Always keep a backup.

## Roadmap
- Car model swap (needs the model ID string/byte per car; the R35 mod replaces game archive files)
- Confirm which light entry is the high beam per car
- Rim type picker with names, body part toggles, plate text
- Archive (`.rpf`) tooling for model swaps and a 3D model workflow

## Credits
Jakes625 for the original MCLA ModTool; the MCLA modding community codebooks for field research (their text is not redistributed here).

Not affiliated with Rockstar, EA or Take-Two. Midnight Club is a trademark of its owners.
