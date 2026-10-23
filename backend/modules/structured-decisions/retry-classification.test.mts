import { Response } from 'undici'
import { describe, expect, it } from 'vitest'
import { classifyProviderFailure, classifyProviderResponse } from './retry-classification.mts'

describe('structured-decision transport policy', () => {
  it.each([
    ['openrouter', 'transient'],
    ['typesafe', 'permanent'],
  ] as const)('binds %s to its own rejection classifier', (transport, retryClass) => {
    expect(classifyProviderFailure(transport, 403, undefined)).toBe(retryClass)
    expect(
      classifyProviderResponse(transport, new Response('', { status: 403 }), undefined),
    ).toMatchObject({ retryClass })
  })
})
