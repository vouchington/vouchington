import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateNativeConsumerUsage } from './native-consumer-usage.mts'

describe('pending native consumer claims', () => {
  afterEach(() => vi.restoreAllMocks())

  it('warns without failing for an unused pending claim', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() =>
      validateNativeConsumerUsage(
        [{ key: 'common.cancel', consumers: ['swift'], pending: true }],
        [],
      ),
    ).not.toThrow()
    expect(warning).toHaveBeenCalledWith(
      'Native consumer manifest pending: unused swift manifest claim "common.cancel" (no product source references it)',
    )
  })

  it('still fails for an unused ordinary claim alongside a pending warning', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() =>
      validateNativeConsumerUsage(
        [
          { key: 'common.cancel', consumers: ['swift'], pending: true },
          { key: 'common.save', consumers: ['dotnet'] },
        ],
        [],
      ),
    ).toThrow('unused dotnet manifest claim "common.save"')
    expect(warning).toHaveBeenCalledWith(
      'Native consumer manifest pending: unused swift manifest claim "common.cancel" (no product source references it)',
    )
  })

  it('accepts an adopted claim while its pending flag remains', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() =>
      validateNativeConsumerUsage(
        [{ key: 'common.cancel', consumers: ['swift'], pending: true }],
        [
          {
            path: 'swift-clients/ui/Sources/Feature/View.swift',
            content: 'Text(localize(.commonCancel))',
          },
        ],
      ),
    ).not.toThrow()
    expect(warning).not.toHaveBeenCalled()
  })
})
