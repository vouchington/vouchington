import { describe, expect, it, vi } from 'vitest'
import {
  acquireTestAiUsageDateReservation,
  countAiUsageOpenAIResponseKeys,
  countAiUsageRecordsForAgent,
} from '@voucha/test-helpers'
import { unlinkTestAiUsageUncertaintyKey } from '@voucha/test-helpers/ai-usage-uncertainty-key'
import {
  evaluateSpendCapBreach,
  getAccountingUncertaintyKey,
  getAccountingUncertaintySource,
  getDailyAiCostTotalMicrounits,
  getSpendCapFields,
  refreshDailyAiCostTotalMicrounits,
  spendCapConfig,
} from '@services/ai-usage'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { recordAgentResponseUsage } from '../record-response-usage.mts'
import { createBackgroundResponseRegistrationHooks } from '../record-response-background-hooks.mts'

const usage = { input_tokens: 100, output_tokens: 50 }
const tokens = { inputTokens: 100, outputTokens: 50 }
const model = 'gpt-6-luna-2026-10-01'

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
  try {
    await run(reservation.day)
  } finally {
    vi.useRealTimers()
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
  expect(error).toMatchObject({ message: `AI usage has an unusable response id: ${slug}` })
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
        transport: 'direct' as const,
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

  it('uses a valid registration ID when the completed ID is unusable', async () => {
    await withReservedDay(async day => {
      const slug = agentSlug()
      const registrationId = `resp_fallback_${slug}`
      const params = {
        response: response(' invalid'),
        agentSlug: slug,
        transport: 'direct' as const,
        registration: {
          responseId: registrationId,
          kind: 'table' as const,
          createdAt: createdAt(day),
        },
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

  it('preserves the inline registration and response-ID fence with an invalid completed ID', async () => {
    await withReservedDay(async day => {
      const slug = agentSlug()
      const registrationId = `resp_inline_${slug}`
      const background = createBackgroundResponseRegistrationHooks({
        agentSlug: slug,
        createdAt: createdAt(day),
      })
      sentryCaptureExceptionMock.mockClear()

      await background.hooks.onResponseCreated(registrationId)
      const registration = background.getRegistration()
      if (!registration || registration.kind !== 'table')
        throw new Error('Expected an inline registration')
      await recordAgentResponseUsage({
        response: response(' invalid'),
        agentSlug: slug,
        transport: 'direct' as const,
        registration,
      })

      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
      expectRedactedUsageDiagnostic(slug)

      await recordAgentResponseUsage({
        response: response(' invalid'),
        agentSlug: slug,
        transport: 'direct' as const,
        registration,
      })

      await expect(countAiUsageRecordsForAgent(slug, tokens)).resolves.toBe(1)
      await expect(countAiUsageOpenAIResponseKeys(registrationId)).resolves.toBe(1)
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
        transport: 'direct' as const,
        createdAt: createdAt(day),
      })
      await recordAgentResponseUsage({
        response: response(id),
        agentSlug: slug,
        transport: 'direct' as const,
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
        transport: 'direct' as const,
        createdAt: createdAt(day),
      })

      await expect(countAiUsageRecordsForAgent(slug, tokens)).resolves.toBe(1)
      await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
      const total = await refreshDailyAiCostTotalMicrounits()
      expect(total.day).toBe(day)
      await expect(getDailyAiCostTotalMicrounits(day)).resolves.toEqual(total)
      expect(total.totalMicrounits).toBeGreaterThan(0)
      expect(total.hasUnpricedRows).toBe(false)
      await spendCapConfig.waitForInitialization()
      const cap = getSpendCapFields()
      expect(cap.enabled).toBe(true)
      expect(cap.daily_cap_microunits).toBeGreaterThan(total.totalMicrounits)
      await expect(evaluateSpendCapBreach()).resolves.toBeNull()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
      expectRedactedUsageDiagnostic(slug)
    })
  })
})
