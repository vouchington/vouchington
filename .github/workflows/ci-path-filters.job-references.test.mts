import { describe, expect, it } from 'vitest'

import {
  formatViolation,
  jobReferences,
  pathGateViolations,
} from '../test-helpers/ci-job-path-references.mts'

describe('ci path filters cover files that gated jobs execute', () => {
  it('finds the Playwright job and its bounded-test wrapper', () => {
    const found = jobReferences().some(
      ref =>
        ref.area === 'web' && ref.job === 'test-playwright' && ref.file === 'ci/run-bounded.py',
    )
    expect(found).toBe(true)
  })

  it('triggers every gated job from each tracked file its steps reference', () => {
    expect(pathGateViolations().map(formatViolation)).toEqual([])
  })
})
