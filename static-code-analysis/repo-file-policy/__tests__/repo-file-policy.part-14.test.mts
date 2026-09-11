import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  describe('config-driven SQL after no-mistakes consume', () => {
    it(
      'does not enforce INSERT replay-safety (owned by no-mistakes postgres-idempotent-insert)',
      { timeout: 10_000 },
      async () => {
        const dir = await makeRepo()
        await track(
          dir,
          'backend/data-stores/psql/config-driven/0999-bad.sql',
          "INSERT INTO foo (id) VALUES ('bar');\n",
        )

        await expect(run(dir)).resolves.toMatchObject({
          stdout: expect.stringContaining('pass'),
        })
      },
    )
  })
})
