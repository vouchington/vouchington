import { describe, expect, it } from 'vitest'
import {
  CLASSIFIER_REQUEST_AGE_ALARM_MS,
  CLASSIFIER_RUN_AGE_ALARM_MS,
} from '@services/classifier-runs'
import { readClassifierHealthClockForTest } from '@voucha/test-helpers/classifier-health-clock'
import { createSyntheticFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  requestSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { sentryCaptureMessageMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { checkClassifierRunHealth } from './classifier-run-health.mts'
import { createClassifierRunHandler } from './classifier-run-handler.mts'

describe('classifier receipt age boundaries', () => {
  it.each([
    ['run-age', CLASSIFIER_RUN_AGE_ALARM_MS],
    ['request-age', CLASSIFIER_REQUEST_AGE_ALARM_MS],
  ] as const)('alarms only after the exact %s threshold', async (kind, thresholdMs) => {
    const setup = await createSyntheticFixture()
    if (kind === 'run-age') await reserveSyntheticRun(setup)
    else await requestSyntheticRun(setup)
    const handler = createClassifierRunHandler({
      adapter: setup.adapter,
      execute: async () => 'persisted',
    })
    const clock = await readClassifierHealthClockForTest(setup.slug)

    for (const [ageMs, expectedAlarms] of [
      [thresholdMs - 1, 0],
      [thresholdMs, 0],
      [thresholdMs + 1, 1],
    ] as const) {
      sentryCaptureMessageMock.mockClear()
      await checkClassifierRunHealth([handler], new Date(clock.fresh.getTime() + ageMs))
      const alarms = sentryCaptureMessageMock.mock.calls.filter(
        ([message, hint]) =>
          message === 'classifier_run_alarm' &&
          hint.tags.alarm_kind === kind &&
          hint.tags.classifier === setup.slug,
      )
      expect(alarms).toHaveLength(expectedAlarms)
    }
  })
})
