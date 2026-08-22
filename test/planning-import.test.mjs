import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const lock = JSON.parse(await readFile(resolve(root, "architecture/planning-inputs.lock.json"), "utf8"));

test("protected planning imports match their G0 source hashes", async () => {
  for (const [path, expected] of Object.entries(lock.files)) {
    const content = await readFile(resolve(root, path));
    assert.equal(createHash("sha256").update(content).digest("hex"), expected, path);
  }
});
