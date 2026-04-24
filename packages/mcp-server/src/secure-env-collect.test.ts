// @gsd-build/mcp-server — Behaviour tests for secure_env_collect MCP tool
//
// The previous version of this file (#4816) re-implemented the tool
// handler's filter/format logic inline (5 of 7 tests built the
// `provided`/`skipped` arrays in the test body, then asserted against
// their own local construction). None of those tests actually
// exercised the handler registered in `createMcpServer`.
//
// This rewrite uses a DI seam (`CreateMcpServerOptions.McpServerCtor`)
// to inject a mock McpServer that captures the registered handler.
// Tests then call the REAL handler with a controllable `elicitInput`
// and assert on what it returns. If the handler's filter/format code
// regresses, these tests fail.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMcpServer } from "./server.js";
import { SessionManager } from "./session-manager.js";

// ─── Mock McpServer — captures registered tool handlers ────────────────

type RegisteredTool = {
  name: string;
  description: string;
  params: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

type ElicitResponse = {
  action: "accept" | "cancel" | "decline";
  content?: Record<string, unknown>;
};

interface ToolContent {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function makeMockServerCtor() {
  const state: {
    tools: RegisteredTool[];
    elicitResponse: ElicitResponse;
    elicitCalls: unknown[];
  } = {
    tools: [],
    elicitResponse: { action: "accept", content: {} },
    elicitCalls: [],
  };

  class MockMcpServer {
    server = {
      elicitInput: async (req: unknown): Promise<ElicitResponse> => {
        state.elicitCalls.push(req);
        return state.elicitResponse;
      },
    };
    tool(
      name: string,
      description: string,
      params: Record<string, unknown>,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ): void {
      state.tools.push({ name, description, params, handler });
    }
    async connect(): Promise<void> {
      /* no-op */
    }
    async close(): Promise<void> {
      /* no-op */
    }
  }

  return { Ctor: MockMcpServer as never, state };
}

// ─── Fixture helper ────────────────────────────────────────────────────

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

function textOf(result: unknown): string {
  const r = result as ToolContent;
  return (r.content ?? []).map((c) => c.text).join("\n");
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("secure_env_collect — handler behaviour", () => {
  let tmp: string;
  let sm: SessionManager;

  beforeEach(() => {
    tmp = makeTempDir("sec-collect");
    sm = new SessionManager();
  });

  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    await sm.cleanup();
  });

  it("registers the secure_env_collect tool via createMcpServer", async () => {
    const { Ctor, state } = makeMockServerCtor();
    await createMcpServer(sm, { McpServerCtor: Ctor });

    const tool = state.tools.find((t) => t.name === "secure_env_collect");
    assert.ok(tool, "secure_env_collect should be registered");
    assert.ok(
      tool.description.length > 0,
      "tool should carry a non-empty description",
    );
    assert.ok(
      tool.description.includes("NEVER appear in tool output") ||
        tool.description.toLowerCase().includes("never"),
      "description should flag the no-secrets-in-output contract",
    );
  });

  it("short-circuits with 'already set' when every key exists", async () => {
    const envPath = join(tmp, ".env");
    writeFileSync(envPath, "FIRST=1\nSECOND=2\n");

    const { Ctor, state } = makeMockServerCtor();
    await createMcpServer(sm, { McpServerCtor: Ctor });
    const tool = state.tools.find((t) => t.name === "secure_env_collect")!;

    const result = await tool.handler({
      projectDir: tmp,
      keys: [{ key: "FIRST" }, { key: "SECOND" }],
      destination: "dotenv",
      // envFilePath omitted — handler defaults to '.env' inside projectDir.
      // Passing an absolute envFilePath trips the realpath-vs-symlink
      // containment check on macOS tmpdirs (/var vs /private/var).
    });

    const text = textOf(result);
    assert.match(text, /already set/);
    assert.match(text, /FIRST/);
    assert.match(text, /SECOND/);
    // Elicit was NOT called — short-circuit path.
    assert.equal(state.elicitCalls.length, 0);
  });

  it("writes provided values to .env and never returns the secret in output", async () => {
    const envPath = join(tmp, ".env");

    const { Ctor, state } = makeMockServerCtor();
    state.elicitResponse = {
      action: "accept",
      content: { SEC_KEY_WRITE: "sk-definitely-not-in-output-xyz" },
    };
    await createMcpServer(sm, { McpServerCtor: Ctor });
    const tool = state.tools.find((t) => t.name === "secure_env_collect")!;

    const result = await tool.handler({
      projectDir: tmp,
      keys: [{ key: "SEC_KEY_WRITE" }],
      destination: "dotenv",
      // envFilePath omitted — handler defaults to '.env' inside projectDir.
      // Passing an absolute envFilePath trips the realpath-vs-symlink
      // containment check on macOS tmpdirs (/var vs /private/var).
    });

    const text = textOf(result);
    // .env must contain the value.
    assert.match(
      readFileSync(envPath, "utf-8"),
      /SEC_KEY_WRITE=sk-definitely-not-in-output-xyz/,
    );
    // But the tool output must NOT — this is the contract the tool name promises.
    assert.ok(
      !text.includes("sk-definitely-not-in-output-xyz"),
      `tool output must not contain secret. got: ${text}`,
    );
    assert.match(text, /SEC_KEY_WRITE.*applied/);

    // Cleanup the process.env hydration applySecrets does.
    delete process.env.SEC_KEY_WRITE;
  });

  it("separates empty form fields into 'skipped' without writing them", async () => {
    const envPath = join(tmp, ".env");

    const { Ctor, state } = makeMockServerCtor();
    state.elicitResponse = {
      action: "accept",
      content: {
        FILLED_KEY: "real-value",
        // Empty string — the handler MUST classify this as skipped.
        EMPTY_KEY: "",
        // Whitespace-only — must also classify as skipped (trim).
        WS_KEY: "   ",
      },
    };
    await createMcpServer(sm, { McpServerCtor: Ctor });
    const tool = state.tools.find((t) => t.name === "secure_env_collect")!;

    const result = await tool.handler({
      projectDir: tmp,
      keys: [
        { key: "FILLED_KEY" },
        { key: "EMPTY_KEY" },
        { key: "WS_KEY" },
      ],
      destination: "dotenv",
      // envFilePath omitted — handler defaults to '.env' inside projectDir.
      // Passing an absolute envFilePath trips the realpath-vs-symlink
      // containment check on macOS tmpdirs (/var vs /private/var).
    });

    const text = textOf(result);
    assert.match(text, /FILLED_KEY.*applied/, "FILLED_KEY should be applied");
    assert.match(text, /EMPTY_KEY.*skipped/, "EMPTY_KEY should be skipped");
    assert.match(text, /WS_KEY.*skipped/, "WS_KEY should be skipped");

    // The .env must only contain the filled key.
    const envContent = readFileSync(envPath, "utf-8");
    assert.match(envContent, /FILLED_KEY=real-value/);
    assert.ok(
      !envContent.includes("EMPTY_KEY="),
      "empty form field must not be written to .env",
    );
    assert.ok(
      !envContent.includes("WS_KEY="),
      "whitespace-only form field must not be written to .env",
    );

    delete process.env.FILLED_KEY;
  });

  it("handles a mix of existing, new, and skipped keys in one call", async () => {
    const envPath = join(tmp, ".env");
    writeFileSync(envPath, "EXISTING_MIX=already-here\n");

    const { Ctor, state } = makeMockServerCtor();
    state.elicitResponse = {
      action: "accept",
      content: { NEW_MIX: "new-value", SKIP_MIX: "" },
    };
    await createMcpServer(sm, { McpServerCtor: Ctor });
    const tool = state.tools.find((t) => t.name === "secure_env_collect")!;

    const result = await tool.handler({
      projectDir: tmp,
      keys: [
        { key: "EXISTING_MIX" },
        { key: "NEW_MIX" },
        { key: "SKIP_MIX" },
      ],
      destination: "dotenv",
      // envFilePath omitted — handler defaults to '.env' inside projectDir.
      // Passing an absolute envFilePath trips the realpath-vs-symlink
      // containment check on macOS tmpdirs (/var vs /private/var).
    });

    const text = textOf(result);
    assert.match(text, /EXISTING_MIX.*already set/);
    assert.match(text, /NEW_MIX.*applied/);
    assert.match(text, /SKIP_MIX.*skipped/);
    // Only the new one was elicited for (existing was pre-filtered).
    assert.equal(state.elicitCalls.length, 1);

    delete process.env.NEW_MIX;
  });

  it("returns a cancellation message when user declines the form", async () => {
    const envPath = join(tmp, ".env");

    const { Ctor, state } = makeMockServerCtor();
    state.elicitResponse = { action: "cancel" };
    await createMcpServer(sm, { McpServerCtor: Ctor });
    const tool = state.tools.find((t) => t.name === "secure_env_collect")!;

    const result = await tool.handler({
      projectDir: tmp,
      keys: [{ key: "CANCELLED_KEY" }],
      destination: "dotenv",
      // envFilePath omitted — handler defaults to '.env' inside projectDir.
      // Passing an absolute envFilePath trips the realpath-vs-symlink
      // containment check on macOS tmpdirs (/var vs /private/var).
    });

    const text = textOf(result);
    assert.match(text, /cancelled/i);
    // No .env write on cancel: either the file wasn't created at all, or
    // if it was it doesn't contain the key.
    const { existsSync: exists } = await import("node:fs");
    if (exists(envPath)) {
      assert.ok(
        !readFileSync(envPath, "utf-8").includes("CANCELLED_KEY="),
        ".env should not contain key on cancel",
      );
    }
  });

  it("auto-detects destination from project files when not specified", async () => {
    // vercel.json in project dir should auto-detect to 'vercel'. Since
    // we don't have execFn injected to mock vercel CLI calls, use the
    // dotenv fallback: if no vercel/convex signals, falls back to dotenv.
    const envPath = join(tmp, ".env");

    const { Ctor, state } = makeMockServerCtor();
    state.elicitResponse = {
      action: "accept",
      content: { AUTO_DETECT_KEY: "auto-value" },
    };
    await createMcpServer(sm, { McpServerCtor: Ctor });
    const tool = state.tools.find((t) => t.name === "secure_env_collect")!;

    const result = await tool.handler({
      projectDir: tmp,
      keys: [{ key: "AUTO_DETECT_KEY" }],
      // Intentionally omit `destination` — handler should auto-detect.
      // envFilePath omitted — defaults to '.env' inside projectDir.
    });

    const text = textOf(result);
    assert.match(
      text,
      /auto-detected/,
      "result should announce an auto-detected destination",
    );

    delete process.env.AUTO_DETECT_KEY;
  });
});
