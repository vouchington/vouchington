import { describe, expect, it } from 'vitest'
import { parsedDispatch } from '../test-helpers/fix-main.test-helpers.mts'

describe('fix-main workflow', () => {
  it('checks out only the immutable workflow implementation without persisted credentials', () => {
    const dispatchJob = parsedDispatch.jobs?.dispatch
    const checkoutStep = dispatchJob?.steps?.find(s => s.uses?.startsWith('actions/checkout@'))

    expect(dispatchJob).toBeDefined()
    expect(checkoutStep?.with).toMatchObject({
      ref: '${{ github.workflow_sha }}',
      'persist-credentials': false,
    })
  })
})
