// Smoke test for dashboard-react/src/sentences.ts — the pack ordering and
// parsing behind the record button's sentence card.
// Run directly: `node scripts/test_sentence_packs.ts` — Node strips the types,
// no build step. The pack names below are the ones in the repo's sentences/.
import assert from "node:assert";
import fs from "node:fs";
import {
  orderPacks,
  packSuffix,
  parsePack,
  randomSentence,
} from "../dashboard-react/src/sentences.ts";

// The real folder, as of writing: two plain packs plus EN/PL pairs.
const ACTUAL = [
  "casual_EN",
  "casual_PL",
  "English",
  "flirty_EN",
  "flirty_PL",
  "formal_EN",
  "formal_PL",
  "Polish",
];

function test_capital_names_first_then_grouped_by_tag() {
  assert.deepStrictEqual(orderPacks(ACTUAL), [
    "English",
    "Polish",
    "casual_EN",
    "flirty_EN",
    "formal_EN",
    "casual_PL",
    "flirty_PL",
    "formal_PL",
  ]);
}

function test_same_ending_stays_together() {
  const ordered = orderPacks(ACTUAL);
  for (const tag of ["EN", "PL"]) {
    const positions = ordered
      .map((id, i) => (packSuffix(id) === tag ? i : -1))
      .filter((i) => i >= 0);
    const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
    assert.ok(contiguous, `${tag} files are not adjacent: ${ordered.join(", ")}`);
  }
}

function test_suffix_is_the_trailing_tag_only() {
  assert.strictEqual(packSuffix("casual_EN"), "EN");
  assert.strictEqual(packSuffix("formal_PL"), "PL");
  assert.strictEqual(packSuffix("English"), "");
  assert.strictEqual(packSuffix("foo_en"), ""); // lowercase isn't a tag
  assert.strictEqual(packSuffix("foo_EN_extra"), ""); // not the ending
  assert.strictEqual(packSuffix("a_PLX"), ""); // three capitals
  assert.strictEqual(packSuffix("notes"), "");
}

function test_parse_drops_blanks_and_keeps_accents() {
  const pack = parsePack("casual_PL", "Hej, co słychać?\r\n\r\n  Nic takiego.  \n\n");
  assert.deepStrictEqual(pack.sentences, ["Hej, co słychać?", "Nic takiego."]);
  assert.strictEqual(pack.id, "casual_PL");
  assert.strictEqual(pack.suffix, "PL");
}

function test_random_sentence_stays_inside_the_pack() {
  const pack = parsePack("small_EN", "one\ntwo\nthree");
  for (let i = 0; i < 50; i++) {
    assert.ok(pack.sentences.includes(randomSentence(pack)));
  }
}

function test_random_sentence_avoids_an_immediate_repeat() {
  const pack = parsePack("two_EN", "alpha\nbeta");
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(randomSentence(pack, "alpha"), "beta");
    assert.strictEqual(randomSentence(pack, "beta"), "alpha");
  }
  // a pack whose lines are all identical still returns one of them
  const same = parsePack("same_EN", "same\nsame");
  assert.strictEqual(randomSentence(same, "same"), "same");
}

function test_empty_pack_is_empty() {
  assert.strictEqual(randomSentence(parsePack("blank_EN", "\n\n")), "");
}

// The build injects sentences/*.txt into the bundle (sentencePacksPlugin.mjs),
// and a missing folder means no card rather than an error — so a forgotten
// `git add sentences/` would ship the feature empty and nothing else would say
// so. This is the one test that reads the repo rather than a literal list.
function test_the_folder_is_actually_there() {
  const dir = new URL("../sentences", import.meta.url);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f: string) => f.toLowerCase().endsWith(".txt"))
    : [];
  assert.ok(
    files.length > 0,
    "no sentences/*.txt in the repo — commit them, or the sentence card ships empty",
  );
}

const tests = [
  test_capital_names_first_then_grouped_by_tag,
  test_same_ending_stays_together,
  test_suffix_is_the_trailing_tag_only,
  test_parse_drops_blanks_and_keeps_accents,
  test_random_sentence_stays_inside_the_pack,
  test_random_sentence_avoids_an_immediate_repeat,
  test_empty_pack_is_empty,
  test_the_folder_is_actually_there,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
    console.log(`[OK] ${test.name}`);
  } catch (e) {
    failed++;
    console.error(`[FAIL] ${test.name}: ${(e as Error).message}`);
  }
}
if (failed > 0) {
  console.error(`${failed}/${tests.length} tests failed`);
  process.exit(1);
}
console.log(`${tests.length}/${tests.length} tests passed`);
