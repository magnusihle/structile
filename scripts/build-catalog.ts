/**
 * Emit `dist/catalog.json`, the runtime component catalog the DS-001 protected suite
 * consumes. Registrations are data; no component implementation is imported here.
 *
 * The catalog is empty at this tranche by design: `@structile/primitives` and
 * `@structile/components` are G1/G3 work that has not landed. The generator, schema and
 * validation path are what this tranche establishes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCatalog } from "@structile/catalog";

const root = resolve(import.meta.dirname, "..");
const registrations: readonly unknown[] = [];

const catalog = buildCatalog(registrations);
await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(resolve(root, "dist/catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ components: catalog.components.length, output: "dist/catalog.json" })}\n`);
