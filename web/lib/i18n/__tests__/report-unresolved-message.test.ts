import { describe, expect, it, vi } from 'vitest'
import { createUnresolvedMessageReporter } from '../report-unresolved-message'

describe('createUnresolvedMessageReporter', () => {
  it('captures one error per key and returns an empty string', () => {
    const captureException =
      vi.fn<
        (error: Error, context: { tags: Record<string, string>; fingerprint: string[] }) => void
      >()
    const onUnresolved = createUnresolvedMessageReporter('es', captureException)

    expect(onUnresolved('nav.doesNotExist')).toBe('')
    expect(onUnresolved('nav.doesNotExist')).toBe('')
    expect(onUnresolved('settings.language')).toBe('')

    expect(captureException).toHaveBeenCalledTimes(2)
    expect(captureException).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: 'Unresolvable message key "nav.doesNotExist"' }),
      {
        tags: { i18n: 'unresolved-message', locale: 'es', key: 'nav.doesNotExist' },
        fingerprint: ['i18n-unresolved-message', 'es', 'nav.doesNotExist'],
      },
    )
  })

  it('returns an empty string through the default Sentry capture', () => {
    expect(createUnresolvedMessageReporter('en')('nav.doesNotExist')).toBe('')
  })
})
