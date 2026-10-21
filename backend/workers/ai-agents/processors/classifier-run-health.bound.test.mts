import { describe, expect, it } from 'vitest'
import {
  CLASSIFIER_REQUEST_AGE_ALARM_MS,
  CLASSIFIER_RUN_AGE_ALARM_MS,
} from '@services/classifier-runs'
import { createStoryClusteringRunAdapter } from '@services/stories'
import { createHealthyClassifierRunHealth } from '@voucha/test-helpers/classifier-run-worker'
import { sentryCaptureMessageMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { checkClassifierRunHealth } from './classifier-run-health.mts'
import { createClassifierRunHandler } from './classifier-run-handler.mts'

describe('classifier receipt age boundaries', () => {
  it.each([
    ['run-age', CLASSIFIER_RUN_AGE_ALARM_MS],
    ['request-age', CLASSIFIER_REQUEST_AGE_ALARM_MS],
  ] as const)('alarms only after the exact %s threshold', async (kind, thresholdMs) => {
    const adapter = createStoryClusteringRunAdapter()
    const handler = createClassifierRunHandler({ adapter, execute: async () => 'persisted' })
    const now = new Date('2026-02-01T00:00:00.000Z')

    for (const [ageMs, expectedAlarms] of [
      [thresholdMs - 1, 0],
      [thresholdMs, 0],
      [thresholdMs + 1, 1],
    ] as const) {
      sentryCaptureMessageMock.mockClear()
      const oldest = { id: crypto.randomUUID(), ageMs, total: 1 }
      await checkClassifierRunHealth([handler], now, async () => ({
        ...createHealthyClassifierRunHealth(adapter.slug),
        oldestIncompleteRun: kind === 'run-age' ? oldest : null,
        oldestPendingRequest: kind === 'request-age' ? oldest : null,
      }))
      const alarms = sentryCaptureMessageMock.mock.calls.filter(
        ([message, hint]) =>
          message === 'classifier_run_alarm' &&
          hint.tags.alarm_kind === kind &&
          hint.tags.classifier === adapter.slug,
      )
      expect(alarms).toHaveLength(expectedAlarms)
    }
  })
})
