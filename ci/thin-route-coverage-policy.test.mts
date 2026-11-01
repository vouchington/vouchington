import { describe, expect, it } from 'vitest'

import { thinRouteCoverageViolations } from './thin-route-coverage-policy.mts'

describe('thin route coverage policy', () => {
  it('accepts coverage text that imports every discovered route', () => {
    const discovered = [
      'web/app/(topics)/topic/[id]/page.tsx',
      'web/app/(topics)/topic/[id]/discussions/page.ts',
    ]
    const coverageText = [
      "from '../../../app/(topics)/topic/[id]/page'",
      "from '../../../app/(topics)/topic/[id]/discussions/page'",
    ].join('\n')
    expect(thinRouteCoverageViolations(discovered, coverageText)).toEqual([])
  })

  it('reports a discovered route the coverage tests do not import', () => {
    expect(
      thinRouteCoverageViolations(
        ['web/app/(posts)/story/[id]/page.tsx', 'web/app/(posts)/link/[id]/page.tsx'],
        "from '../../../app/(posts)/link/[id]/page'",
      ),
    ).toEqual([
      'thin route web/app/(posts)/story/[id]/page.tsx is not loaded by the route coverage tests',
    ])
  })

  it('fails when the route discovery is empty', () => {
    expect(thinRouteCoverageViolations([], 'from "../../../app/(posts)/link/[id]/page"')).toEqual([
      'thin route coverage discovered no page or layout modules',
    ])
  })
})
