# Third-party licenses bundled with this installer

Euphonia's source code is MIT/public domain (see the repo's `LICENSE` and
`README.md`). This installer, however, bundles three GPLv3 components as
part of its `analyze.exe` sidecar and audio pipeline. Because they're
distributed together as one combined artifact, GPLv3's terms apply to that
combined artifact — see the "Note on the analyzer's GPL dependency" section
of the project README for what this does and doesn't mean for the source
code.

## Praat

Speech-analysis engine by Paul Boersma and David Weenink (University of
Amsterdam). Licensed under the **GNU General Public License v3.0**.

- Homepage: <https://www.fon.hum.uva.nl/praat/>
- Source & license: <https://github.com/praat/praat/blob/master/LICENSE.md>

## parselmouth (praat-parselmouth)

Python bindings for Praat, by Yannick Jadoul, Bill Thompson, and Annemie de
Boer. Licensed under the **GNU General Public License v3.0** (it links
against and embeds Praat).

- Homepage: <https://github.com/YannickJadoul/Parselmouth>
- Source & license: <https://github.com/YannickJadoul/Parselmouth/blob/master/LICENSE>

## ffmpeg

The `ffmpeg.exe` build bundled in `electron/resources/ffmpeg/` (see
`electron/electron-builder.yml` for the exact download URL) is a "full"
Gyan.dev Windows build, which enables GPL-licensed components (e.g. libx264).
Such builds are licensed under the **GNU General Public License v3.0**.

- Homepage: <https://ffmpeg.org/>
- Build source: <https://github.com/GyanD/codexffmpeg>
- License: <https://www.gnu.org/licenses/gpl-3.0.txt>

---

The full GPLv3 text is available at <https://www.gnu.org/licenses/gpl-3.0.txt>
and is not reproduced here in full; each project's own repository (linked
above) carries its authoritative copy.
