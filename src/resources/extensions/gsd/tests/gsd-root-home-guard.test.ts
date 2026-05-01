/**
 * GSD2 — regression test for #5187: gsdRoot() must refuse to use the global
 * GSD home (~/.gsd) as a project .gsd directory when basePath resolves to
 * $HOME. Paths under ~/.gsd/projects/<hash>/ remain valid.
 *
 * Before the fix, gsdRoot(homedir()) returned ~/.gsd silently and downstream
 * writes polluted the user's global state directory. After the fix, it throws.
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { gsdRoot, _clearGsdRootCache } from '../paths.ts';

describe('gsdRoot() refuses ~/.gsd as project state when basePath is $HOME (#5187)', () => {
  let fakeHome: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedGsdHome: string | undefined;

  beforeEach(() => {
    fakeHome = realpathSync(mkdtempSync(join(tmpdir(), 'gsd-home-guard-')));
    mkdirSync(join(fakeHome, '.gsd'), { recursive: true });

    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedGsdHome = process.env.GSD_HOME;

    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    delete process.env.GSD_HOME;

    _clearGsdRootCache();
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = savedGsdHome;

    _clearGsdRootCache();
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('throws when basePath is the home directory and result equals gsdHome()', () => {
    assert.throws(
      () => gsdRoot(fakeHome),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.match(
          (err as Error).message,
          /global GSD home|project .gsd directory/i,
          'message should explain the refusal',
        );
        return true;
      },
    );
  });

  test('does NOT throw for paths under ~/.gsd/projects/<hash>/', () => {
    const projectStateDir = join(fakeHome, '.gsd', 'projects', 'abcdef123456');
    mkdirSync(join(projectStateDir, '.gsd'), { recursive: true });
    _clearGsdRootCache();

    const resolved = gsdRoot(projectStateDir);
    assert.equal(resolved, join(projectStateDir, '.gsd'));
  });

  test('does NOT throw for an unrelated project directory that has its own .gsd', () => {
    const projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'gsd-home-guard-proj-')));
    mkdirSync(join(projectDir, '.gsd'), { recursive: true });
    _clearGsdRootCache();
    try {
      const resolved = gsdRoot(projectDir);
      assert.equal(resolved, join(projectDir, '.gsd'));
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
