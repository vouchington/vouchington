import { describe, expect, it } from 'vitest'

import { checkRepoFilePolicy, setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('exits with an error outside a git repository', async () => {
    const result = await checkRepoFilePolicy({
      isInsideGitRepo: false,
      repoRoot: '/repo',
      trackedFileSet: new Set(),
      trackedFiles: [],
    })

    expect(result.errors).toEqual([expect.stringContaining('not inside a git repository')])
  })

  it('allows ALTER TABLE ADD CONSTRAINT in a migration SQL file', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/0999-add-fk.sql',
      `ALTER TABLE foo ADD CONSTRAINT fk_foo FOREIGN KEY (bar_id) REFERENCES bar(id) ON DELETE CASCADE NOT VALID; -- fk-index-guard-allow: unrelated fixture, not testing FK indexing
ALTER TABLE foo VALIDATE CONSTRAINT fk_foo;
`,
    )

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })
})
