// pi-tui CancellableLoader component regression tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CancellableLoader } from "../cancellable-loader.js";

function makeMockTUI() {
	return { requestRender: mock.fn() } as any;
}

describe("CancellableLoader", () => {
	let loader: CancellableLoader;
	let tui: ReturnType<typeof makeMockTUI>;

	beforeEach(() => {
		tui = makeMockTUI();
	});

	afterEach(() => {
		loader?.dispose();
	});

	it("dispose() aborts the AbortController signal", () => {
		loader = new CancellableLoader(tui, (s) => s, (s) => s, "test");
		assert.equal(loader.aborted, false);
		loader.dispose();
		assert.equal(loader.aborted, true);
	});

	it("dispose() clears the onAbort callback", () => {
		loader = new CancellableLoader(tui, (s) => s, (s) => s, "test");
		loader.onAbort = () => {};
		loader.dispose();
		assert.equal(loader.onAbort, undefined);
	});

	// Previous test "signal is aborted after dispose()" asserted the same
	// invariant as "dispose() aborts the AbortController signal" via a
	// different accessor — `loader.aborted` reads `signal.aborted` through a
	// thin getter, so the two tests were tautologically equivalent. Removed
	// per #4796. Coverage for the signal reference itself is adequate via
	// `loader.signal` consumers in the component integration paths.
});
