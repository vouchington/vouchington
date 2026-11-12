import { readFileSync } from 'node:fs'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = { uses?: string; with?: Record<string, string> }
type Workflow = {
  jobs: Record<string, { strategy?: { matrix: { shard: string[] } }; steps?: Step[] }>
}

describe('explain-analyze gate artifact download', () => {
  it('waits for exactly the artifacts the shard matrix uploads', () => {
    const workflow = parse(
      readFileSync('.github/workflows/explain-analyze.yml', 'utf8'),
    ) as Workflow
    const shards = workflow.jobs['explain-analyze']?.strategy?.matrix.shard ?? []
    const download = workflow.jobs['explain-analyze-gates']?.steps?.find(
      step => step.with?.pattern === 'explain-analyze-results-*',
    )

    expect(shards.length).toBeGreaterThan(0)
    const expected = (download?.with?.['expected-names'] ?? '').split(/\s+/).filter(Boolean)
    expect(expected.toSorted()).toEqual(
      shards.map(shard => `explain-analyze-results-${shard}`).toSorted(),
    )
  })
})
