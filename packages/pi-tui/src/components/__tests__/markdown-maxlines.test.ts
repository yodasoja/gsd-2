import assert from "node:assert/strict";
import { test } from "node:test";

import { Markdown, type MarkdownTheme } from "../markdown.js";

function noopTheme(): MarkdownTheme {
	const identity = (text: string) => text;
	return {
		heading: identity,
		link: identity,
		linkUrl: identity,
		code: identity,
		codeBlock: identity,
		codeBlockBorder: identity,
		quote: identity,
		quoteBorder: identity,
		hr: identity,
		listBullet: identity,
		bold: identity,
		italic: identity,
		strikethrough: identity,
		underline: identity,
	};
}

test("Markdown renders all lines when maxLines is not set", () => {
	const labels = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"];
	const text = labels.join("\n\n");
	const md = new Markdown(text, 0, 0, noopTheme());
	const lines = md.render(80);
	// Behaviour contract: every paragraph label must appear in the rendered
	// output, in input order, and no label must be dropped (which would be
	// an implicit truncation). Previous assertion (`contentLines.length >= 5`)
	// was a lower bound only — it silently accepted arbitrary extra lines
	// including duplicates or placeholder noise, and did not verify order.
	// #4796.
	const indices = labels.map((lbl) => lines.findIndex((l) => l.includes(lbl)));
	for (let i = 0; i < labels.length; i++) {
		assert.ok(
			indices[i] >= 0,
			`paragraph ${JSON.stringify(labels[i])} must appear in rendered output`,
		);
	}
	for (let i = 1; i < indices.length; i++) {
		assert.ok(
			indices[i]! > indices[i - 1]!,
			`paragraph ${JSON.stringify(labels[i])} must render after ${JSON.stringify(labels[i - 1])}`,
		);
	}
	// No truncation indicator when maxLines is not set.
	assert.ok(
		!lines.some((l) => l.includes("…")),
		"render without maxLines must not insert a truncation indicator",
	);
});

test("Markdown truncates from the top when maxLines is exceeded", () => {
	const labels = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"];
	const text = labels.join("\n\n");
	const md = new Markdown(text, 0, 0, noopTheme());
	md.maxLines = 3;
	const lines = md.render(80);
	assert.ok(lines.length <= 3, `expected at most 3 lines, got ${lines.length}`);
	// Behaviour contract: truncation drops *earlier* paragraphs so the most
	// recent content survives, and there must be a truncation indicator line
	// carrying the ellipsis glyph. Previous assertion indexed `lines[0]`
	// and required the English word "above", coupling the test to copy
	// changes and layout shuffles. #4796.
	const indicator = lines.find((l) => l.includes("…"));
	assert.ok(indicator, `truncated output must contain an ellipsis indicator, got ${JSON.stringify(lines)}`);
	// Earlier paragraphs must be gone; the last paragraph must survive.
	assert.ok(
		lines.some((l) => l.includes("Line 5")),
		`most recent paragraph must be preserved, got ${JSON.stringify(lines)}`,
	);
	assert.ok(
		!lines.some((l) => l.includes("Line 1")),
		`earliest paragraph must be truncated away, got ${JSON.stringify(lines)}`,
	);
	// The indicator must carry the count of elided paragraphs (>= 1) so the
	// user knows something was dropped. Match a digit in the indicator line.
	assert.ok(
		/\d+/.test(indicator!),
		`indicator must report how many lines were truncated, got ${JSON.stringify(indicator)}`,
	);
});

test("Markdown preserves most recent content when truncating", () => {
	const text = "First paragraph\n\nSecond paragraph\n\nThird paragraph\n\nFourth paragraph\n\nFifth paragraph";
	const md = new Markdown(text, 0, 0, noopTheme());
	md.maxLines = 3;
	const lines = md.render(80);
	// The last rendered line should contain "Fifth paragraph" (the most recent content)
	const lastContentLine = lines.filter((l) => !l.includes("…")).pop() ?? "";
	assert.ok(
		lastContentLine.includes("Fifth paragraph"),
		`expected last content line to contain "Fifth paragraph", got "${lastContentLine}"`,
	);
});

test("Markdown does not truncate when content fits within maxLines", () => {
	const text = "Short text";
	const md = new Markdown(text, 0, 0, noopTheme());
	md.maxLines = 10;
	const lines = md.render(80);
	assert.ok(!lines.some((l) => l.includes("…")), "should not contain ellipsis when content fits");
	assert.ok(lines.some((l) => l.includes("Short text")), "should contain the original text");
});

test("Markdown trims trailing empty lines", () => {
	const text = "Some text\n\n";
	const md = new Markdown(text, 0, 0, noopTheme());
	const lines = md.render(80);
	// Previous assertion was `lastLine.trim().length > 0 || lines.length === 1`
	// — the `|| lines.length === 1` disjunction trivially passed for any
	// single-line render, so a regression that returned `['']` still
	// passed (#4796). Assert the trim invariant directly.
	assert.ok(lines.length > 0, "render must produce at least one line");
	const lastLine = lines[lines.length - 1];
	assert.ok(
		lastLine.trim().length > 0,
		`last line must have visible content after trim, got: ${JSON.stringify(lastLine)}`,
	);
});
