import * as Sentry from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'

describe('@sentry/nextjs jsdom import', () => {
  it('loads the SDK while a document global exists', () => {
    expect(globalThis.document).toBeDefined()
    expect(typeof Sentry.init).toBe('function')
  })
})
