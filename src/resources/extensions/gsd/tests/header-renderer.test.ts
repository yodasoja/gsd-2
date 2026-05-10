// Project/App: GSD-2
// File Purpose: Visual contract tests for the GSD watch header renderer.

import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { renderHeaderLines } from "../watch/header-renderer.ts";

test("renderHeaderLines uses the command-center splash layout", () => {
  const lines = renderHeaderLines(
    {
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      directory: "~/Github/gsd-2",
      branch: "feat/tui-refresh",
      mcpServers: ["context7"],
    },
    120,
  );

  const raw = lines.join("\n");
  const plain = stripVTControlCharacters(raw);

  assert.match(raw, /\x1b\[38;2;167;186;120m/, "logo and divider should use the recommended olive border");
  assert.match(raw, /\x1b\[38;2;141;183;255m/, "header accents should use the recommended blue");
  assert.match(plain, /Project Console/);
  assert.match(plain, /\/gsd start/);
  assert.match(plain, /\/gsd templates/);
  assert.match(plain, /claude-sonnet-4-6/);
  assert.match(plain, /Context7 ✓/);
});
