import { describe, expect, it } from 'vitest'
import { createDiffSummary, reduceDiffBlock } from '../diff-summary.mts'
import type { PackageJsonReader } from '../removed-scripts.mts'
import { runAdvisorySupersessionSearch } from '../supersession.mts'

const reader: PackageJsonReader = () => Promise.resolve(undefined)
const repo = 'vouchington/vouchington'
const patch = 'diff --git a/retired.mts b/retired.mts\ndeleted file mode 100644\n'
function summary() {
  const value = createDiffSummary()
  reduceDiffBlock(value, patch)
  return value
}

describe('runAdvisorySupersessionSearch', () => {
  it('issues zero calls when removals have no vocabulary', async () => {
    let calls = 0
    const empty = createDiffSummary()
    const runGh = () => {
      calls += 1
      return Promise.resolve('[]')
    }
    await expect(runAdvisorySupersessionSearch(runGh, repo, empty, reader)).resolves.toBe('')
    expect(calls).toBe(0)
  })
  it('formats a matching hint', async () => {
    const hints = await runAdvisorySupersessionSearch(
      () => Promise.resolve(JSON.stringify([{ number: 1, title: 'x', url: 'https://x' }])),
      repo,
      summary(),
      reader,
    )
    expect(hints).toContain('#1')
  })
  it('swallows a search failure', async () => {
    await expect(
      runAdvisorySupersessionSearch(
        () => Promise.reject(new Error('gh unavailable')),
        repo,
        summary(),
        reader,
      ),
    ).resolves.toBe('')
  })
})
