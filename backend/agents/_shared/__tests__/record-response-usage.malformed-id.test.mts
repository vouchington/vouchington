import { describe, expect, it, vi } from 'vitest'
import {
  acquireTestAiUsageDateReservation,
  countAiUsageOpenAIResponseKeys,
  countAiUsageRecordsForAgent,
} from '@voucha/test-helpers'
import { unlinkTestAiUsageUncertaintyKey } from '@voucha/test-helpers/ai-usage-uncertainty-key'
import {
  evaluateOpenAiSpendCapBreach,
  getAccountingUncertaintyKey,
  getAccountingUncertaintySource,
  getDailyAiCostTotalMicrounits,
  getOpenAiSpendCapFields,
  openAiSpendCapConfig,
} from '@services/ai-usage'
import { clearDailyAiCostTotalCacheForTesting } from '@services/ai-usage/daily-total'
import { deleteBackgroundResponseRegistration } from '@services/openai-background-responses'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { getBackgroundResponseHooks } from '../create-response.mts'
import {
  callRecordingAgentResponseUsage,
  recordAgentResponseUsage,
} from '../record-response-usage.mts'
import { createBackgroundResponseRegistrationHooks } from '../record-response-background-hooks.mts'

const usage = { input_tokens: 100, output_tokens: 50 }
const tokens = { inputTokens: 100, outputTokens: 50 }
const model = 'gpt-5.4-nano-2026-03-17'

function agentSlug(): string {
  return `malformed-response-id-${Math.random().toString(36).slice(2, 12)}`
}

function response(id?: string) {
  return { id, model, service_tier: 'flex' as const, usage }
}

function createdAt(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`)
}

async function withReservedDay(run: (day: string) => Promise<void>): Promise<void> {
  const reservation = await acquireTestAiUsageDateReservation()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${reservation.day}T12:00:00.000Z`))
  clearDailyAiCostTotalCacheForTesting()
  try {
    await run(reservation.day)
  } finally {
    vi.useRealTimers()
    clearDailyAiCostTotalCacheForTesting()
    try {
      await unlinkTestAiUsageUncertaintyKey(getAccountingUncertaintyKey(reservation.day))
    } finally {
      await reservation.release()
    }
  }
}

function reportedError(index = 0): Error {
  const error = sentryCaptureExceptionMock.mock.calls[index]?.[0]
  if (!(error instanceof Error)) throw new Error('Expected a reported Error')
  return error
}

function expectRedactedUsageDiagnostic(slug: string, index = 0): void {
  const error = reportedError(index)
  expect(error).toMatchObject({ message: `OpenAI usage has an unusable response id: ${slug}` })
  expect(error).not.toHaveProperty('cause')
}

describe('recordAgentResponseUsage response ID storage', () => {
  it.each([
    ['empty', ''],
    ['only U+0020 spaces', '   '],
    ['leading U+0020 space', ' invalid'],
    ['trailing U+0020 space', 'invalid '],
    ['101 ASCII code points', 'x'.repeat(101)],
    ['101 astral code points', '🚀'.repeat(101)],
    ['embedded NUL', 'invalid\0id'],
    ['lone surrogate', '\ud800'],
  ])('records known billed usage keylessly for %s', async (_case, invalidId) => {
    await withReservedDay(async day => {
      const slug = agentSlug()
      sentryCaptureExceptionMock.mockClear()

      await recordAgentResponseUsage({
        response: response(invalidId),
        agentSlug: slug,
        createdAt: createdAt(day),
      })

      await expect(countAiUsageRecordsForAgent(slug, tokens)).resolves.toBe(1)
      const queryableId =
        !invalidId.includes('\0') && invalidId.isWellFormed() ? invalidId : `unused_${slug}`
      await expect(countAiUsageOpenAIResponseKeys(queryableId)).resolves.toBe(0)
      await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
      expectRedactedUsageDiagnostic(slug)
    })
  })

  it('uses a valid registration ID when the completed ID is unusable without a lease', async () => {
    await withReservedDay(async day => {
      const slug = agentSlug()
      const registrationId = `resp_fallback_${slug}`
      const params = {
        response: response(' invalid'),
        agentSlug: slug,
        registration: { responseId: registrationId, lease: undefined },
        createdAt: createdAt(day),
      }
      sentryCaptureExceptionMock.mockClear()

      await recordAgentResponseUsage(params)
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
      expectRedactedUsageDiagnostic(slug)
      await recordAgentResponseUsage(params)

      await expect(countAiUsageRecordsForAgent(slug, tokens)).resolves.toBe(1)
      await expect(countAiUsageOpenAIResponseKeys(registrationId)).resolves.toBe(1)
      await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(2)
      expectRedactedUsageDiagnostic(slug, 1)
    })
  })

  it('preserves the registration lease and response-ID fence with an invalid completed ID', async () => {
    await withReservedDay(async day => {
      const slug = agentSlug()
      const registrationId = `resp_lease_${slug}`
      const background = createBackgroundResponseRegistrationHooks({ agentSlug: slug })
      sentryCaptureExceptionMock.mockClear()

      await background.hooks.onResponseCreated(registrationId)
      const registration = background.getRegistration()
      if (!registration?.lease) throw new Error('Expected an owned background lease')
      await registration.lease.stopAndSettle()
      await recordAgentResponseUsage({
        response: response(' invalid'),
        agentSlug: slug,
        registration,
      })

      await expect(
        deleteBackgroundResponseRegistration(registrationId, registration.lease.leaseToken),
      ).resolves.toBe(false)
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
      expectRedactedUsageDiagnostic(slug)

      await recordAgentResponseUsage({
        response: response(' invalid'),
        agentSlug: slug,
        registration,
      })

      await expect(countAiUsageRecordsForAgent(slug, tokens)).resolves.toBe(1)
      await expect(countAiUsageOpenAIResponseKeys(registrationId)).resolves.toBe(1)
      await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(2)
      expectRedactedUsageDiagnostic(slug, 1)
    })
  })

  it('records keylessly after the real registration hook rejects an invalid ID', async () => {
    await withReservedDay(async day => {
      const slug = agentSlug()
      sentryCaptureExceptionMock.mockClear()

      await callRecordingAgentResponseUsage(
        async () => {
          await expect(getBackgroundResponseHooks()?.onResponseCreated('invalid ')).resolves.toBe(
            undefined,
          )
          expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
          return response()
        },
        { agentSlug: slug },
      )

      await expect(countAiUsageRecordsForAgent(slug, tokens)).resolves.toBe(1)
      await expect(countAiUsageOpenAIResponseKeys('invalid ')).resolves.toBe(0)
      await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(2)
      expectRedactedUsageDiagnostic(slug, 1)
    })
  })

  it.each([
    [
      '100 astral code points',
      (slug: string) =>
        '🚀'.repeat(90) +
        Array.from(slug.slice(-10), char =>
          String.fromCodePoint(0x1f300 + char.codePointAt(0)!),
        ).join(''),
    ],
    ['edge NBSP', (slug: string) => `\u00a0resp_${slug}`],
  ])('preserves a valid %s ID on replay', async (_case, makeId) => {
    await withReservedDay(async day => {
      const slug = agentSlug()
      const id = makeId(slug)
      sentryCaptureExceptionMock.mockClear()

      await recordAgentResponseUsage({
        response: response(id),
        agentSlug: slug,
        createdAt: createdAt(day),
      })
      await recordAgentResponseUsage({
        response: response(id),
        agentSlug: slug,
        createdAt: createdAt(day),
      })

      await expect(countAiUsageRecordsForAgent(slug, tokens)).resolves.toBe(1)
      await expect(countAiUsageOpenAIResponseKeys(id)).resolves.toBe(1)
      await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
      expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
    })
  })

  it('keeps the real spend-cap guard open after successful keyless recording', async () => {
    await withReservedDay(async day => {
      const slug = agentSlug()
      sentryCaptureExceptionMock.mockClear()

      await recordAgentResponseUsage({
        response: response(''),
        agentSlug: slug,
        createdAt: createdAt(day),
      })

      await expect(countAiUsageRecordsForAgent(slug, tokens)).resolves.toBe(1)
      await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
      clearDailyAiCostTotalCacheForTesting()
      const total = await getDailyAiCostTotalMicrounits(day)
      expect(total.totalMicrounits).toBeGreaterThan(0)
      expect(total.hasUnpricedRows).toBe(false)
      await openAiSpendCapConfig.waitForInitialization()
      const cap = getOpenAiSpendCapFields()
      expect(cap.enabled).toBe(true)
      expect(cap.daily_cap_microunits).toBeGreaterThan(total.totalMicrounits)
      await expect(evaluateOpenAiSpendCapBreach()).resolves.toBeNull()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
      expectRedactedUsageDiagnostic(slug)
    })
  })
})
