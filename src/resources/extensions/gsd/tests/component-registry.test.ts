/**
 * Skill component registry tests.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSkills } from '@gsd/pi-coding-agent';
import {
	ComponentRegistry,
	getComponentRegistry,
	resetComponentRegistry,
} from '../component-registry.js';
import type { Component } from '../component-types.js';

let testDir: string;

function setupTestDir(): string {
	const dir = join(tmpdir(), `gsd-component-registry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writeSkill(dir: string, name: string, description: string): void {
	const skillDir = join(dir, name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, 'SKILL.md'), `---
name: ${name}
description: ${description}
---

Use ${name}.
`, 'utf-8');
}

function createComponent(overrides: Partial<Component> = {}): Component {
	return {
		id: overrides.id ?? 'review',
		kind: 'skill',
		metadata: overrides.metadata ?? { name: 'review', description: 'Reviews code' },
		spec: overrides.spec ?? { prompt: 'SKILL.md' },
		dirPath: overrides.dirPath ?? join(testDir, 'review'),
		filePath: overrides.filePath ?? join(testDir, 'review', 'SKILL.md'),
		source: overrides.source ?? 'project',
		format: overrides.format ?? 'skill-md',
		enabled: overrides.enabled ?? true,
	};
}

describe('ComponentRegistry (skills)', () => {
	beforeEach(() => {
		resetComponentRegistry();
		testDir = setupTestDir();
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
		resetComponentRegistry();
	});

	it('registers, lists, resolves, and disables skill components', () => {
		const registry = new ComponentRegistry(testDir, { includeDefaults: false });
		registry.load();
		registry.register(createComponent());

		assert.strictEqual(registry.size, 1);
		assert.strictEqual(registry.resolve('review')?.id, 'review');
		assert.strictEqual(registry.list({ kind: 'skill' }).length, 1);
		assert.strictEqual(registry.setEnabled('review', false), true);
		assert.strictEqual(registry.list().length, 0);
		assert.strictEqual(registry.list({ enabledOnly: false }).length, 1);
	});

	it('keeps first winner and records duplicate-name collisions', () => {
		const registry = new ComponentRegistry(testDir, { includeDefaults: false });
		registry.load();
		registry.register(createComponent({ filePath: join(testDir, 'a', 'SKILL.md') }));
		registry.register(createComponent({ filePath: join(testDir, 'b', 'SKILL.md') }));

		assert.strictEqual(registry.size, 1);
		assert.strictEqual(registry.diagnostics().length, 1);
		assert.strictEqual(registry.diagnostics()[0].type, 'collision');
		assert.strictEqual(registry.diagnostics()[0].collision?.winnerPath, join(testDir, 'a', 'SKILL.md'));
	});

	it('resolves namespace-qualified skills and rejects ambiguous shorthand', () => {
		const registry = new ComponentRegistry(testDir, { includeDefaults: false });
		registry.load();
		registry.register(createComponent({
			id: 'alpha:review',
			metadata: { name: 'review', namespace: 'alpha', description: 'Alpha review' },
		}));
		registry.register(createComponent({
			id: 'beta:review',
			metadata: { name: 'review', namespace: 'beta', description: 'Beta review' },
			filePath: join(testDir, 'beta', 'SKILL.md'),
		}));

		assert.strictEqual(registry.resolve('alpha:review')?.id, 'alpha:review');
		assert.strictEqual(registry.resolve('review'), undefined);
	});

	it('loads new-format skill components from explicit skill paths', () => {
		const skillsDir = join(testDir, '.agents', 'skills');
		const skillDir = join(skillsDir, 'new-review');
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(join(skillDir, 'component.yaml'), `
apiVersion: gsd/v1
kind: skill
metadata:
  name: new-review
  description: "New format skill"
spec:
  prompt: SKILL.md
`, 'utf-8');
		writeFileSync(join(skillDir, 'SKILL.md'), 'Use new-review.', 'utf-8');

		const registry = new ComponentRegistry(testDir, { includeDefaults: false, skillPaths: [skillsDir] });
		registry.load();

		assert.strictEqual(registry.skills().length, 1);
		assert.strictEqual(registry.resolve('new-review')?.format, 'component-yaml');
	});

	it('matches legacy .agents/skills loading shape through getSkillsForPrompt', () => {
		const skillsDir = join(testDir, '.agents', 'skills');
		writeSkill(skillsDir, 'review', 'Reviews code');
		writeSkill(skillsDir, 'security-audit', 'Checks security issues');

		const current = loadSkills({
			cwd: testDir,
			includeDefaults: false,
			skillPaths: [skillsDir],
		}).skills;
		const registry = new ComponentRegistry(testDir, { includeDefaults: false, skillPaths: [skillsDir] });
		registry.load();

		assert.deepStrictEqual(
			registry.getSkillsForPrompt().map(skill => ({
				name: skill.name,
				description: skill.description,
				filePath: skill.filePath,
				baseDir: skill.baseDir,
				source: skill.source,
				disableModelInvocation: skill.disableModelInvocation,
			})).sort((a, b) => a.name.localeCompare(b.name)),
			current.map(skill => ({
				name: skill.name,
				description: skill.description,
				filePath: skill.filePath,
				baseDir: skill.baseDir,
				source: skill.source,
				disableModelInvocation: skill.disableModelInvocation,
			})).sort((a, b) => a.name.localeCompare(b.name)),
		);
	});

	it('returns cwd-specific singletons without private-field casts', () => {
		const first = getComponentRegistry(join(testDir, 'one'));
		const second = getComponentRegistry(join(testDir, 'two'));

		assert.notStrictEqual(first, second);
		assert.strictEqual(second.getCwd(), join(testDir, 'two'));
	});
});
