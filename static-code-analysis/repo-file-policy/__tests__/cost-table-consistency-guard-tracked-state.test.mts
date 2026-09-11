import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

const CANONICAL_COST_DOCS = [
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-pre-launch-baseline.md',
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-steady-state.md',
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-public-ipv4-subtotal.md',
] as const

function canonicalTable(): string {
  return [
    '| Service | Est. $/mo/env |',
    '| ------- | ------------- |',
    '| Lambda | ~$1 |',
    '| **Total** | **~$1** |',
    '',
  ].join('\n')
}

describe('repo-file-policy cost-table tracked-state integration', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('reports a canonical cost leaf that remains tracked after deletion', async () => {
    const dir = await makeRepo()
    for (const file of CANONICAL_COST_DOCS) await track(dir, file, canonicalTable())
    const missingFile = CANONICAL_COST_DOCS[1]
    await rm(join(dir, missingFile))

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `${missingFile}: canonical cost table is tracked but missing or unreadable`,
      ),
    })
  })

  it('ignores a noncanonical deployment-cost leaf tracked after deletion', async () => {
    const dir = await makeRepo()
    for (const file of CANONICAL_COST_DOCS) await track(dir, file, canonicalTable())
    const deletedFile =
      'docs/overview/infrastructure/reference-deployment-costs-ci-testing-costs.md'
    await track(dir, deletedFile, canonicalTable())
    await rm(join(dir, deletedFile))

    await expect(run(dir)).resolves.toMatchObject({ stdout: 'All checks passed.' })
  })
})
