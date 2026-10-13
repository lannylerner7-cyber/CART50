import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverMockupFiles } from "../artifacts/mockup-sandbox/mockupPreviewPlugin.ts";

test("native discovery finds nested TSX and excludes private helpers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mockup-discovery-"));
  try {
    for (const name of ["a.tsx", "nested/b.tsx", "_private.tsx", "_helpers/c.tsx", "nested/_ignore/d.tsx", "plain.ts", ".hidden/e.tsx"]) {
      const file = path.join(root, "src/components/mockups", name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "");
    }
    assert.deepEqual(await discoverMockupFiles(root), [
      "src/components/mockups/a.tsx", "src/components/mockups/nested/b.tsx",
    ]);
    assert.deepEqual(await discoverMockupFiles(path.join(root, "absent")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
