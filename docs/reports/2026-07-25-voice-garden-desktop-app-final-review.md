# Final review fix wave — report

Branch: `fix/final-review-hardening`

## 1. CRITICAL — Missing window-open handler

`electron/src/main.ts`: added `win.webContents.setWindowOpenHandler(...)` (denies the
new-window creation, forwards to `shell.openExternal`) and a `will-navigate` guard that
blocks any in-place navigation away from the `app://` scheme, forwarding it to the OS
browser instead. Both are attached inside `createWindow()`, which is the single site
that constructs a `BrowserWindow` in this file (confirmed via `grep -n "new BrowserWindow"
electron/src/*.ts` — one hit) and is called both at startup and from `app.on("activate")`,
so every window the app can ever create is covered.

**Tested:** `npm run build` in `electron/` compiles clean. Could not click-through the
real onboarding link (would require a real launch + manual click), so this is a
code-review-level confirmation per the task's own allowance for #1.

## 2. CRITICAL — GPL licensing docs/config

- `README.md`: added a new paragraph directly under the existing "Note on the analyzer's
  GPL dependency" section, spelling out that the packaged installer (bundling
  `analyze.exe` w/ frozen Praat/parselmouth, plus a GPL ffmpeg build) is a combined work
  under GPLv3, while the source stays MIT/public domain. Points to the new
  `electron/resources/licenses/THIRD-PARTY-LICENSES.md`.
- `electron/resources/licenses/THIRD-PARTY-LICENSES.md` (new file): short per-component
  summary + upstream license links for Praat, parselmouth, and the bundled ffmpeg build
  (Gyan.dev "full" build — confirmed GPL via `electron-builder.yml`'s own source-URL
  comment), plus a pointer to the canonical GPLv3 text. Not a verbatim multi-page GPLv3
  reproduction — a clear pointer + summary per the task's own guidance.
- `electron/electron-builder.yml`: added `- from: resources/licenses` / `to: licenses`
  to the existing `extraResources` list (did not touch the existing `dashboard`/`sidecar`/
  `ffmpeg` entries besides fix #5's filter).
- Did not touch `LICENSE`, `analyze.py`, or `pyproject.toml` — out of scope per the task.

**Tested:** `git status --short` confirms `electron/resources/ffmpeg/` (gitignored,
fetched-manually per the repo's `.gitignore`) is untouched and the new `licenses/`
subfolder is untracked-but-present and not ignored (the `.gitignore` rule is scoped to
`electron/resources/ffmpeg/` only, verified via `git check-ignore`/`git status --ignored`).

## 3. IMPORTANT — Corrupt insight cache dead-end

- `electron/src/gemini.ts`'s `readCachedInsight`: wrapped the `JSON.parse`/read in
  try/catch, returning `null` on any parse or read failure (same contract as the
  existing "file doesn't exist" branch).
- `dashboard-react/src/components/GeneratedInsight.tsx`: added `.catch()` to the
  `insights.get(...)` promise chain in the `useEffect`, setting `insight` back to `null`
  and `status` to `"idle"` (which renders the existing "generate insight" button) instead
  of leaving `status` stuck on `"loading"` forever.

**Tested — real, not just code review:** built `electron/` (`tsc -b`), then loaded the
compiled `dist/gemini.js` in a plain Node script with a minimal stub `electron` module
(only `app.getPath()`, placed at `electron/dist/node_modules/electron/index.js` so
Node's resolution picks it up ahead of the real `electron` package — deleted immediately
after the test) pointed at a temp userData dir. Wrote a deliberately corrupt file
`analysis/1-insight.json` containing `not valid json {{{`. Called
`readCachedInsight(1)` (corrupt file) and `readCachedInsight(999)` (missing file):

```
result for corrupt cache file: null
result for missing cache file: null
```

Both return `null` synchronously with no throw — the IPC handler (`ipcMain.handle
("insights:get", ...)`) never rejects, so the renderer's `.then()` fires with `null`,
`status` becomes `"idle"`, and the "generate insight" button renders. This directly
demonstrates the fix; the `.catch()` in `GeneratedInsight.tsx` is then defense-in-depth
for any other rejection path (e.g. IPC-layer errors unrelated to the cache file itself).
Temp stub directory (`electron/dist/node_modules/`) was deleted after the test; `electron/
dist/` was confirmed to only contain the normal compiled `.js` files afterward.

## 4. IMPORTANT — Denied mic permission does nothing

`dashboard-react/src/components/RecordButton.tsx`'s `start()`: wrapped the body in
try/catch. On any rejection (mic permission denied, no device, etc.) it now
`console.error(e)`s and calls `setState("error")`, reusing the component's existing
`"error"` render branch (message + "try again" button that resets to `"idle"`) — no new
UI needed.

**Tested:** `npm run build` in `dashboard-react/` compiles clean (`tsc -b && vite build`).
Per the task's own allowance, there's no way to force a real `getUserMedia` rejection in
this environment, so this is a code-review-level confirmation: the try/catch wraps the
entire previous body including the `getUserMedia` call, and the `"error"` branch was
pre-existing and unchanged.

## 5. IMPORTANT — Installer could embed real voice recordings

`electron/electron-builder.yml`: added a `filter` to the existing `dashboard-react/dist`
`extraResources` entry (did not duplicate the block), excluding `recordings.json`,
`audio/**`, and `analysis/**` from what gets copied into the installer's `dashboard`
resource folder, while still including everything else (`**/*` then explicit `!`
exclusions).

**Tested:** reviewed the final YAML; matches the exact filter shape given in the task.
Did not run a full `electron-builder` packaging pass (out of scope for this fix — no
`dist-sidecar`/`resources/ffmpeg` present in this worktree to make a full package build
meaningful), but the filter syntax matches electron-builder's documented minimatch-based
`extraResources[].filter` format used elsewhere in this same file's `files:` key.

## 6. IMPORTANT — Path-containment check has no committed test

Created `scripts/test_protocol_paths.js` (CommonJS — `electron/package.json` has no
`"type": "module"` field and `electron/tsconfig.json` targets `"module": "CommonJS"`, and
there's no root `package.json` forcing ESM on the `scripts/` dir either, so plain
`require()`-style `.js` matches `test_analyze_paths.py`'s "no framework, run directly"
style). It copies `resolveWithinBase`'s exact logic from `electron/src/protocol.ts`
(commented as a mirror, since `protocol.ts` imports the real `electron` package at the
top and isn't standalone-importable outside an Electron process). Cases:

- normal relative path within base — accepted
- nested path — accepted
- `../` and `../../` traversal, including traversal that only escapes after a `sub/../../`
  hop — rejected
- percent-encoded traversal (`..%2f..%2fescape.txt`) — decoded first (matching
  `protocol.ts`'s real call order: `decodeURIComponent` happens in
  `registerAppProtocolHandler` *before* `resolveWithinBase` is ever called, confirmed by
  reading the file), then rejected same as plain `../`
- empty relative path (e.g. requesting `.../audio/` so the prefix strips to `""`)
  resolves to the base dir itself, not rejected — documented as the known Minor finding,
  not fixed here per the task's instruction

Note: I initially also tried a bare `"/"` relative path expecting it to resolve to the
base dir, but on Windows `path.resolve(base, "/")` treats `/` as an absolute path and
jumps to the drive root (`C:\`), which correctly gets rejected by `resolveWithinBase` —
different from the empty-string case. Removed that assertion since `protocol.ts` never
actually passes a bare `/` as the relative path (it always comes from slicing a fixed
prefix like `"audio/"` off the decoded pathname), so it wasn't testing real behavior.

**Tested:** `node scripts/test_protocol_paths.js`:

```
[OK] test_normal_relative_path_accepted
[OK] test_nested_path_accepted
[OK] test_traversal_rejected
[OK] test_percent_encoded_traversal_rejected
[OK] test_empty_relative_path_resolves_to_base
5/5 tests passed
```

Exit code 0.

## Verification summary

- `electron`: `npm run build` (`tsc -b`) — clean, no errors.
- `dashboard-react`: `npm run build` (`tsc -b && vite build`) — clean, no errors, 68
  modules transformed.
- `node scripts/test_protocol_paths.js` — 5/5 pass, exit 0.
- Fix #3 verified with a real (stubbed-Electron) execution of the compiled code, not
  just code review.

## Files changed

- `electron/src/main.ts` (fix 1)
- `README.md` (fix 2)
- `electron/resources/licenses/THIRD-PARTY-LICENSES.md` (new, fix 2)
- `electron/electron-builder.yml` (fixes 2 and 5, same file — kept as separate logical
  hunks, see diff)
- `electron/src/gemini.ts` (fix 3)
- `dashboard-react/src/components/GeneratedInsight.tsx` (fix 3)
- `dashboard-react/src/components/RecordButton.tsx` (fix 4)
- `scripts/test_protocol_paths.js` (new, fix 6)

## Self-review findings

- Confirmed `electron/resources/ffmpeg/` is gitignored (`.gitignore` line: `electron/
  resources/ffmpeg/`) but `electron/resources/licenses/` is not covered by that pattern,
  so the new license file is trackable/committable normally.
- Confirmed only one `new BrowserWindow(...)` call site exists in the whole `electron/src`
  tree, so the fix-1 handlers cover every window without needing to touch the `activate`
  callback separately.
- Did not touch `LICENSE`, `analyze.py`, `pyproject.toml`, or anything in
  `electron-builder.yml` beyond the two approved entries (GPL license resource + dashboard
  filter) — everything else in the review stays deferred as instructed.
- Cleaned up the temporary `electron/dist/node_modules/` stub used to test fix #3 before
  committing, so it doesn't ship or get accidentally staged.

## Concerns

- None blocking. Fixes 1, 2, and 5 are verified at compile/config-review level rather than
  full runtime/packaging level, per the task's own stated allowances for what's feasible
  in this environment (no real click-through browser test for #1, no full
  `electron-builder` packaging pass for #5 since `dist-sidecar`/`resources/ffmpeg` aren't
  present in this worktree).
