import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dynamicConfigPrimaryValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit, type GlideClient, type GlideString, type SetOptions } from '@valkey/valkey-glide'
import { createTestFutureUtcDay } from '@voucha/test-helpers'
import {
  getAccountingUncertaintyKey,
  getAccountingUncertaintySource,
  latchAccountingUncertainty,
  type AccountingUncertaintyValkeyClient,
} from '../accounting-uncertainty.mts'

describe('accounting uncertainty latch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the source once with an expiry at the request-day boundary', async () => {
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'))
    const { client, setCalls } = createClient()

    await latchAccountingUncertainty(
      { requestDay: '2026-08-17', source: 'ledger_write_failed' },
      client,
    )

    expect(setCalls).toEqual([
      {
        key: getAccountingUncertaintyKey('2026-08-17'),
        options: {
          conditionalSet: 'onlyIfDoesNotExist',
          expiry: { type: TimeUnit.Seconds, count: 43_200 },
        },
        value: 'ledger_write_failed',
      },
    ])
  })

  it('persists and strongly reads the latch through the real primary client', async () => {
    const requestDay = createTestFutureUtcDay()
    const key = getAccountingUncertaintyKey(requestDay)
    vi.setSystemTime(new Date(`${requestDay}T12:00:00.000Z`))
    try {
      await latchAccountingUncertainty({ requestDay, source: 'ledger_write_failed' })
      await expect(getAccountingUncertaintySource(requestDay)).resolves.toBe('ledger_write_failed')
    } finally {
      await dynamicConfigPrimaryValkeyClient.unlink([key])
    }
  })

  it('preserves the first source when a later uncertainty signal arrives', async () => {
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'))
    const { client } = createClient()

    await latchAccountingUncertainty(
      { requestDay: '2026-08-17', source: 'ledger_write_failed' },
      client,
    )
    await latchAccountingUncertainty(
      { requestDay: '2026-08-17', source: 'unknown_billed_attempt' },
      client,
    )

    await expect(getAccountingUncertaintySource('2026-08-17', client)).resolves.toBe(
      'ledger_write_failed',
    )
  })

  it('returns the persisted diagnostic source and null when no latch exists', async () => {
    const { client } = createClient()

    await expect(getAccountingUncertaintySource('2026-08-17', client)).resolves.toBeNull()
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'))
    await latchAccountingUncertainty(
      { requestDay: '2026-08-17', source: 'unknown_billed_attempt' },
      client,
    )

    await expect(getAccountingUncertaintySource('2026-08-17', client)).resolves.toBe(
      'unknown_billed_attempt',
    )
  })

  it('does not write a latch for a past request day', async () => {
    vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'))
    const { client, setCalls } = createClient()

    await expect(
      latchAccountingUncertainty(
        { requestDay: '2026-08-17', source: 'ledger_write_failed' },
        client,
      ),
    ).resolves.toBeUndefined()
    expect(setCalls).toEqual([])
  })

  it('rejects when the latch write fails', async () => {
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'))
    const error = new Error('Valkey unavailable')
    const client = {
      get: async (): Promise<GlideString | null> => null,
      set: async (): Promise<'OK' | GlideString | null> => Promise.reject(error),
    } satisfies AccountingUncertaintyValkeyClient

    await expect(
      latchAccountingUncertainty(
        { requestDay: '2026-08-17', source: 'ledger_write_failed' },
        client,
      ),
    ).rejects.toBe(error)
  })
})

function createClient(): {
  client: AccountingUncertaintyValkeyClient
  setCalls: Array<{ key: string; value: string; options: SetOptions | undefined }>
} {
  const values = new Map<string, string>()
  const setCalls: Array<{ key: string; value: string; options: SetOptions | undefined }> = []
  const client = {
    get: async (key: GlideString): Promise<GlideString | null> => values.get(String(key)) ?? null,
    set: async (
      key: GlideString,
      value: GlideString,
      options?: SetOptions,
    ): Promise<'OK' | GlideString | null> => {
      const stringKey = String(key)
      const stringValue = String(value)
      setCalls.push({ key: stringKey, value: stringValue, options })
      if (options?.conditionalSet === 'onlyIfDoesNotExist' && values.has(stringKey)) return null
      values.set(stringKey, stringValue)
      return 'OK'
    },
  } satisfies Pick<GlideClient, 'get' | 'set'>
  return { client, setCalls }
}
