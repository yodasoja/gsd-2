// Project/App: GSD-2
// File Purpose: Tests final provider request-time tool compatibility filtering.

import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@gsd/pi-agent-core";
import { filterToolsForProviderRequest } from "./sdk.js";
import { registerToolCompatibility, resetToolCompatibilityRegistry } from "./tools/tool-compatibility-registry.js";

function tool(name: string): AgentTool {
	return {
		name,
		label: name,
		description: name,
		parameters: Type.Object({}),
		execute: async () => ({ content: [], details: undefined }),
	};
}

test("filterToolsForProviderRequest removes provider-incompatible tools", () => {
	resetToolCompatibilityRegistry();
	try {
		registerToolCompatibility("image_result_tool", { producesImages: true });
		registerToolCompatibility("complex_schema_tool", { schemaFeatures: ["patternProperties"] });

		const result = filterToolsForProviderRequest(
			[tool("bash"), tool("image_result_tool"), tool("complex_schema_tool")],
			{ api: "google-generative-ai" },
		);

		assert.deepEqual(result.compatible.map((entry) => entry.name), ["bash", "image_result_tool"]);
		assert.deepEqual(result.filtered.map((entry) => entry.name), ["complex_schema_tool"]);
	} finally {
		resetToolCompatibilityRegistry();
	}
});
