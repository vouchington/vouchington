import { describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import { createUnresolvedMessageReporter } from '../report-unresolved-message'

vi.hoisted(() => vi.resetModules())

vi.mock(import('@sentry/nextjs'), () => ({
  captureException: vi.fn<typeof Sentry.captureException>(),
}))

describe('unresolved message Sentry adapter', () => {
  it('sends unresolved messages through the configured Sentry capture', () => {
    createUnresolvedMessageReporter('es')('nav.doesNotExist')
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { i18n: 'unresolved-message', locale: 'es', key: 'nav.doesNotExist' },
      }),
    )
  })
})
