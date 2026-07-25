// Smoke test for electron/src/protocol.ts's resolveWithinBase().
// Run directly: `node scripts/test_protocol_paths.js`.
//
// electron/src/protocol.ts isn't importable standalone (pulls in the
// "electron" module at the top of the file), so this mirrors the exact
// resolveWithinBase() logic below. Keep it in sync with protocol.ts if that
// function changes.
"use strict";

const path = require("node:path");
const assert = require("node:assert");

// --- mirrors electron/src/protocol.ts:resolveWithinBase() ---
function resolveWithinBase(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, relativePath);
  const normalizedBase = path.resolve(baseDir) + path.sep;
  if (resolved !== path.resolve(baseDir) && !resolved.startsWith(normalizedBase)) {
    return null; // escapes the base directory — reject
  }
  return resolved;
}
// --- end mirror ---

const BASE = path.resolve(__dirname, "..", "some-base-dir");

function test_normal_relative_path_accepted() {
  const result = resolveWithinBase(BASE, "1-foo.wav");
  assert.strictEqual(result, path.join(BASE, "1-foo.wav"));
}

function test_nested_path_accepted() {
  const result = resolveWithinBase(BASE, "sub/dir/file.json");
  assert.strictEqual(result, path.join(BASE, "sub", "dir", "file.json"));
}

function test_traversal_rejected() {
  assert.strictEqual(resolveWithinBase(BASE, "../secrets.txt"), null);
  assert.strictEqual(resolveWithinBase(BASE, "../../etc/passwd"), null);
  assert.strictEqual(resolveWithinBase(BASE, "sub/../../escape.txt"), null);
}

function test_percent_encoded_traversal_rejected() {
  // protocol.ts calls decodeURIComponent(url.pathname) BEFORE the pathname
  // ever reaches resolveWithinBase (see registerAppProtocolHandler), so the
  // relevant case is: does resolveWithinBase reject the traversal once it's
  // already been decoded to plain "../"? (This is what the "protects against
  // path traversal via percent-encoded slashes" comment on the real function
  // depends on — the decode happens upstream, not inside this function.)
  const decoded = decodeURIComponent("..%2f..%2fescape.txt"); // -> "../../escape.txt"
  assert.strictEqual(resolveWithinBase(BASE, decoded), null);
}

function test_empty_relative_path_resolves_to_base() {
  // Known Minor finding: an empty relative path (e.g. requesting
  // "app://dashboard/audio/" so the "audio/" prefix strips down to "")
  // resolves to the base dir itself rather than being rejected as
  // not-a-file. This test documents that existing behavior — it is NOT
  // being fixed here.
  assert.strictEqual(resolveWithinBase(BASE, ""), path.resolve(BASE));
}

const tests = [
  test_normal_relative_path_accepted,
  test_nested_path_accepted,
  test_traversal_rejected,
  test_percent_encoded_traversal_rejected,
  test_empty_relative_path_resolves_to_base,
];

if (require.main === module) {
  let failed = 0;
  for (const test of tests) {
    try {
      test();
      console.log(`[OK] ${test.name}`);
    } catch (e) {
      failed++;
      console.error(`[FAIL] ${test.name}: ${e.message}`);
    }
  }
  if (failed > 0) {
    console.error(`${failed}/${tests.length} tests failed`);
    process.exit(1);
  }
  console.log(`${tests.length}/${tests.length} tests passed`);
}
