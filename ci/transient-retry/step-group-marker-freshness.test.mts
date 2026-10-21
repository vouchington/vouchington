import { describe, expect, it } from 'vitest'

import {
  externalActionPrefixes,
  markerHeaderViolations,
  stepHeaderGroups,
  uncoveredMarkers,
} from './step-group-marker-policy.mts'

const marker = '##[group]Run pnpm build'

describe('step-group marker policy', () => {
  it('keeps independent job boundaries, first literal run lines, and local action headers', () => {
    const source = `jobs:
  first:
    steps:
      - run: |
          pnpm build
          echo done
      - uses: ./local/action
      - uses: external/action@fixture
  second:
    steps:
      - run: pnpm build
`
    const groups = stepHeaderGroups(source)
    expect(groups).toEqual([[marker, '##[group]Run ./local/action'], [marker]])
    expect(markerHeaderViolations(marker, groups, 2)).toEqual([])
    expect(markerHeaderViolations(marker, groups, 1)).toEqual([
      `${marker}: unexpected matching job count`,
    ])
  })

  it('accepts composite action and folded YAML headers', () => {
    expect(
      stepHeaderGroups('runs:\n  steps:\n    - run: >-\n        pnpm\n        build\n'),
    ).toEqual([[marker]])
    expect(stepHeaderGroups('jobs:\n  empty: {}')).toEqual([[]])
  })

  it('rejects missing, duplicate and ambiguous prefix headers', () => {
    expect(markerHeaderViolations(marker, [], 1)).toEqual([
      `${marker}: unexpected matching job count`,
    ])
    expect(markerHeaderViolations(marker, [[marker, marker]], 1)).toEqual([
      `${marker}: duplicate step header`,
    ])
    expect(markerHeaderViolations(marker, [[marker, `${marker}:web`]], 1)).toEqual([
      `${marker}: ambiguous step header prefix`,
    ])
  })

  it('admits third-party prefixes only while an intended YAML source invokes them', () => {
    const sources = new Map([
      ['one.mts', "const marker = '##[group]Run external/action@'"],
      ['two.mts', "const marker = '##[group]Run removed/action@'"],
    ])
    const prefixes = externalActionPrefixes([
      'runs:\n steps:\n - uses: external/action@fixture\n - uses: ./local/action@fixture',
    ])
    expect([...prefixes]).toEqual(['external/action@'])
    expect(uncoveredMarkers(sources, prefixes)).toEqual(['two.mts: ##[group]Run removed/action@'])
    expect(uncoveredMarkers(sources, new Set())).toHaveLength(2)
  })

  it('reads quoted, folded, and aliased action steps but ignores script decoys', () => {
    const source = `jobs:
  lint:
    steps:
      - &action
        "uses": 'external/quoted@fixture'
      - *action
      - uses: >-
          external/folded@fixture
      - run: |
          uses: external/decoy@fixture
      - uses: ./local/action@fixture
`
    expect([...externalActionPrefixes([source])]).toEqual(['external/quoted@', 'external/folded@'])
    expect(externalActionPrefixes(['jobs: { empty: {} }'])).toEqual(new Set())
  })

  it('rejects an undeclared repo-owned literal and accepts registered Table A literals', async () => {
    const { cloudflareWorkerTscStepMarker } = await import('./static-analysis-log-fingerprints.mts')
    const sources = new Map([
      ['rules.mts', `const first = '${cloudflareWorkerTscStepMarker}'\nconst second = '${marker}'`],
    ])
    expect(uncoveredMarkers(sources, new Set())).toEqual([`rules.mts: ${marker}`])
  })
})
