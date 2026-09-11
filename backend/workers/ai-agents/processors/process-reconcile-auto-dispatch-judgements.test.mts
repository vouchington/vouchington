import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import { moderationAiDispatchConfig } from '@services/moderation/ai-config'
import { processReconcileAutoDispatchJudgements } from './process-reconcile-auto-dispatch-judgements.mts'

describe('processReconcileAutoDispatchJudgements', () => {
  beforeEach(async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, { auto_dispatch_enabled: false })
  })
  afterAll(async () => {
    await closeScopedDynamicConfigContext([moderationAiDispatchConfig])
  })

  it('returns early when auto_dispatch_enabled is false', async () => {
    await expect(processReconcileAutoDispatchJudgements()).resolves.toBeUndefined()
  })

  it('queries undispatched judgements when enabled (no-op: fresh rows are < 2 min old)', async () => {
    // Fresh judgements are excluded by the 2-minute lower bound, so getUndispatchedJudgements
    // returns [] — still exercises the enabled path and the Promise.all dispatch branch.
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, { auto_dispatch_enabled: true })
    await expect(processReconcileAutoDispatchJudgements()).resolves.toBeUndefined()
  })
})
