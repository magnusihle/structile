import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SpawnProcessTransport } from "../dist/index.js";

test("budget termination does not leave a descendant in the agent process group", { skip: process.platform === "win32" }, async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "structile-agent-process-group-"));
  const marker = resolve(directory, "descendant-survived");
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });

  const descendantScript = [
    "const { writeFileSync } = require('node:fs');",
    "setTimeout(() => writeFileSync(process.argv[1], 'survived'), 400);"
  ].join("\n");
  const parentScript = [
    "const { spawn } = require('node:child_process');",
    "const descendant = spawn(process.execPath, ['-e', process.argv[1], process.argv[2]], { stdio: 'ignore' });",
    "descendant.once('spawn', () => process.stdout.write('xx'));",
    "setTimeout(() => {}, 10_000);"
  ].join("\n");

  const transport = new SpawnProcessTransport();
  await assert.rejects(transport.run({
    program: process.execPath,
    args: ["-e", parentScript, descendantScript, marker],
    cwd: directory,
    environment: { PATH: process.env.PATH ?? "" },
    timeoutMs: 5_000,
    maxOutputBytes: 1
  }), /output budget exceeded/);

  await delay(700);
  await assert.rejects(access(marker), { code: "ENOENT" });
});
