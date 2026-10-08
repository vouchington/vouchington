import { describe, expect, it, vi } from 'vitest'
import { makeModelCallResult } from '@voucha/test-helpers/agents/model-call-result'
import { ModelProviderError, type ModelProviderErrorCode } from '@modules/model-providers/errors'
import type { recordModelProviderAlarm } from '@modules/on-error'
import type { latchAccountingUncertainty } from '@services/ai-usage'
import { callRecordingModelUsage } from '../call-recording-model-usage.mts'
import type { recordModelUsage } from '../record-model-usage.mts'

const anthropic = {
  agentSlug: 'report-judgement',
  selection: { provider: 'anthropic', model: 'claude-haiku-5-5' },
  openaiTransport: 'openrouter',
} as const

function setup() {
  const record = vi.fn<typeof recordModelUsage>().mockResolvedValue(undefined)
  const alarm = vi.fn<typeof recordModelProviderAlarm>()
  const latch = vi.fn<typeof latchAccountingUncertainty>().mockResolvedValue(undefined)
  const deps = {
    assertDailySpendCapNotBreached: async () => null,
    recordModelUsage: record,
    recordModelProviderAlarm: alarm,
    latchAccountingUncertainty: latch,
  }
  return { record, alarm, latch, deps }
}

function providerError(
  code: ModelProviderErrorCode,
  options: Partial<ConstructorParameters<typeof ModelProviderError>[2]> = {},
) {
  return new ModelProviderError(code, `failure ${code}`, { retryClass: 'permanent', ...options })
}

describe('callRecordingModelUsage for Anthropic', () => {
  it('records a resolved call under the provider, transport and tier the response reports', async () => {
    const { record, deps } = setup()
    const result = makeModelCallResult({ ok: true })

    await expect(
      callRecordingModelUsage(async () => result, { ...anthropic, postId: 'post-1' }, deps),
    ).resolves.toBe(result)

    expect(record).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        agentSlug: 'report-judgement',
        postId: 'post-1',
        responseId: result.responseId,
        provider: 'anthropic',
        transport: 'direct',
        model: 'claude-haiku-5-5',
        serviceTier: 'standard',
        usage: result.usage,
        registration: undefined,
      }),
    )
  })

  it.each(['refusal', 'output-truncated', 'invalid-response'] as const)(
    'records the billed usage of an unusable %s answer before rethrowing it',
    async code => {
      const { record, alarm, latch, deps } = setup()
      const billed = makeModelCallResult(null)
      const error = providerError(code, { billedResponse: billed })

      await expect(
        callRecordingModelUsage(() => Promise.reject(error), anthropic, deps),
      ).rejects.toBe(error)

      expect(record).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ responseId: billed.responseId, usage: billed.usage }),
      )
      expect(alarm).not.toHaveBeenCalled()
      expect(latch).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['client-unavailable', 'client-unavailable', undefined],
    ['credit-balance-too-low', 'credit-balance-too-low', 400],
    ['authentication', 'provider-rejected', 401],
    ['permission', 'provider-rejected', 403],
  ] as const)('alarms for %s without recording anything', async (code, kind, status) => {
    const { record, alarm, deps } = setup()
    const error = providerError(code, { status })

    await expect(
      callRecordingModelUsage(() => Promise.reject(error), anthropic, deps),
    ).rejects.toBe(error)

    expect(alarm).toHaveBeenCalledExactlyOnceWith({
      kind,
      service: 'report-judgement',
      provider: 'anthropic',
      status,
    })
    expect(record).not.toHaveBeenCalled()
  })

  it('latches the request day when a failure leaves whether it billed unknown', async () => {
    const { record, alarm, latch, deps } = setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'))
    try {
      const error = providerError('connection', { retryClass: 'transient', ambiguousBilled: true })

      await expect(
        callRecordingModelUsage(() => Promise.reject(error), anthropic, deps),
      ).rejects.toBe(error)

      expect(latch).toHaveBeenCalledExactlyOnceWith({
        requestDay: '2026-10-07',
        source: 'unknown_billed_attempt',
      })
      expect(record).not.toHaveBeenCalled()
      expect(alarm).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('latches the request day when the caller’s deadline aborts a request that was sent', async () => {
    const { record, alarm, latch, deps } = setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'))
    try {
      const controller = new AbortController()
      const aborted = new DOMException('The operation was aborted.', 'AbortError')

      await expect(
        callRecordingModelUsage(
          () => {
            controller.abort()
            return Promise.reject(aborted)
          },
          { ...anthropic, signal: controller.signal },
          deps,
        ),
      ).rejects.toBe(aborted)

      expect(latch).toHaveBeenCalledExactlyOnceWith({
        requestDay: '2026-10-07',
        source: 'unknown_billed_attempt',
      })
      expect(record).not.toHaveBeenCalled()
      expect(alarm).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not latch a failure that is not an abort when the deadline has not passed', async () => {
    const { latch, deps } = setup()
    const failure = new Error('bug')

    await expect(
      callRecordingModelUsage(
        () => Promise.reject(failure),
        { ...anthropic, signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toBe(failure)

    expect(latch).not.toHaveBeenCalled()
  })

  it('rethrows a transient failure that did not bill without recording, alarming or latching', async () => {
    const { record, alarm, latch, deps } = setup()
    const error = providerError('overloaded', { retryClass: 'transient', status: 529 })

    await expect(
      callRecordingModelUsage(() => Promise.reject(error), anthropic, deps),
    ).rejects.toBe(error)

    expect([record, alarm, latch].map(mock => mock.mock.calls.length)).toEqual([0, 0, 0])
  })

  it('rethrows an unrelated error untouched', async () => {
    const { record, deps } = setup()
    const error = new TypeError('not a provider failure')

    await expect(
      callRecordingModelUsage(() => Promise.reject(error), anthropic, deps),
    ).rejects.toBe(error)

    expect(record).not.toHaveBeenCalled()
  })
})
