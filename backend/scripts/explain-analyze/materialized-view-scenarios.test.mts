import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MATERIALIZED_VIEW_SCENARIOS } from './materialized-view-scenarios.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

type Snapshot = { views: Record<string, { materialized: boolean }> }

describe('materialized view EXPLAIN coverage', () => {
  it('runs a registered defining-query scenario for every materialized view in the schema snapshot', () => {
    const snapshot = JSON.parse(
      readFileSync(
        new URL('../../data-stores/psql/schema-snapshot/schema.json', import.meta.url),
        'utf8',
      ),
    ) as Snapshot
    const snapshotViews = Object.entries(snapshot.views)
      .filter(([, view]) => view.materialized)
      .map(([name]) => name)
      .toSorted()
    const scenarioViews = MATERIALIZED_VIEW_SCENARIOS.map(([, view]) => view)
    const scenarioIds = MATERIALIZED_VIEW_SCENARIOS.map(([id]) => id)

    expect(scenarioViews.toSorted()).toEqual(snapshotViews)
    expect(new Set(scenarioViews).size).toBe(scenarioViews.length)
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length)
    expect(scenarioIds.filter(id => !EXPLAIN_SCENARIO_MANIFEST.includes(id))).toEqual([])
  })
})
