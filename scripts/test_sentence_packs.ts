// Smoke test for dashboard-react/src/sentences.ts — the pack listing rules
// behind the record button's sentence card.
// Run directly: `node scripts/test_sentence_packs.ts` — Node strips the types,
// no build step.
//
// The ordering rule is pinned with a small synthetic set (a unit test), while
// the repo's own sentences/ folder is read and checked against the rules rather
// than against a hardcoded list of names.
import assert from "node:assert";
import fs from "node:fs";
import {
  isPack,
  listPacks,
  packSuffix,
  parsePack,
  randomSentence,
} from "../dashboard-react/src/sentences.ts";

const SENTENCES_DIR = new URL("../sentences", import.meta.url);

/** Pack ids actually present in the repo, read at test time. */
function realPackIds(): string[] {
  if (!fs.existsSync(SENTENCES_DIR)) return [];
  return fs
    .readdirSync(SENTENCES_DIR)
    .filter((f: string) => f.toLowerCase().endsWith(".txt"))
    .map((f: string) => f.replace(/\.txt$/i, ""));
}

function test_convention_files_only() {
  // neither a capital start nor an _XX ending: not offered at all
  assert.deepStrictEqual(listPacks(["notes", "draft-v2", "scratch_file", "readme"]), []);
  // capital start, no tag: offered, and first
  assert.deepStrictEqual(listPacks(["notes", "English"]), ["English"]);
  // _XX ending, lowercase start: offered, below the capital ones
  assert.deepStrictEqual(listPacks(["notes", "English", "casual_EN"]), ["English", "casual_EN"]);
  assert.ok(isPack("English") && isPack("casual_PL"));
  assert.ok(!isPack("notes") && !isPack("draft-v2") && !isPack("scratch_file"));
}

function test_capital_names_first_then_grouped_by_tag() {
  assert.deepStrictEqual(
    listPacks(["casual_PL", "casual_EN", "English", "formal_EN", "Polish", "formal_PL"]),
    ["English", "Polish", "casual_EN", "formal_EN", "casual_PL", "formal_PL"],
  );
}

function test_same_ending_stays_together() {
  const ordered = listPacks(["formal_PL", "casual_EN", "casual_PL", "formal_EN"]);
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

// ---- the repo's own folder, checked against the rules, not a name list ----

function test_the_folder_has_packs() {
  // The packs are read from this folder at runtime and a missing one means no
  // card rather than an error, so a forgotten `git add sentences/` would ship
  // the feature empty and nothing else would say so.
  assert.ok(
    realPackIds().length > 0,
    "no sentences/*.txt in the repo — commit them, or the sentence card ships empty",
  );
}

function test_real_folder_is_listed_by_the_rules() {
  const real = realPackIds();
  const listed = listPacks(real);

  // everything following the convention is offered, and nothing else is
  assert.deepStrictEqual([...listed].sort(), real.filter(isPack).sort());
  for (const id of listed) assert.ok(isPack(id), `${id} was listed but breaks the convention`);
}

function test_real_order_obeys_the_rules() {
  const listed = listPacks(realPackIds());
  const capital = (id: string) => /^[A-Z]/.test(id);

  // capital-initial names all come first
  const firstLower = listed.findIndex((id) => !capital(id));
  if (firstLower >= 0) {
    assert.ok(
      listed.slice(firstLower).every((id) => !capital(id)),
      `a capital-initial pack sits below a lowercase one: ${listed.join(", ")}`,
    );
  }

  // same-tag files are adjacent, and the tag groups run in ascending order
  const tags = listed.filter((id) => !capital(id)).map(packSuffix);
  const groups: string[] = [];
  for (const t of tags) if (groups[groups.length - 1] !== t) groups.push(t);
  assert.strictEqual(
    new Set(groups).size,
    groups.length,
    `tag groups interleave: ${listed.join(", ")}`,
  );
  assert.deepStrictEqual(groups, [...groups].sort(), `tag groups out of order: ${listed.join(", ")}`);
}

// ---- the endpoint the app actually reads, and the folder it serves ---- //

// What sentencePacksPlugin.mjs serves as sentences/index.json, in the dev server
// and in the snapshot a build emits. Read here so the server side and the rules
// can't drift apart.
const { readSentencePacks } = (await import(
  "../dashboard-react/sentencePacksPlugin.mjs"
)) as { readSentencePacks: () => Record<string, string> };

function test_endpoint_serves_the_folder() {
  const payload = readSentencePacks();
  assert.deepStrictEqual(
    Object.keys(payload).sort(),
    realPackIds().sort(),
    "the served pack ids are not the folder's .txt names",
  );
  for (const [id, text] of Object.entries(payload)) {
    assert.ok(text.trim().length > 0, `${id} was served with no sentences in it`);
  }
}

function test_listing_comes_from_the_endpoint() {
  const payload = readSentencePacks();
  assert.deepStrictEqual(
    listPacks(Object.keys(payload)),
    listPacks(realPackIds()),
    "the app would list something other than what the endpoint serves",
  );
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

const tests = [
  test_convention_files_only,
  test_capital_names_first_then_grouped_by_tag,
  test_same_ending_stays_together,
  test_suffix_is_the_trailing_tag_only,
  test_the_folder_has_packs,
  test_real_folder_is_listed_by_the_rules,
  test_real_order_obeys_the_rules,
  test_endpoint_serves_the_folder,
  test_listing_comes_from_the_endpoint,
  test_parse_drops_blanks_and_keeps_accents,
  test_random_sentence_stays_inside_the_pack,
  test_random_sentence_avoids_an_immediate_repeat,
  test_empty_pack_is_empty,
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
