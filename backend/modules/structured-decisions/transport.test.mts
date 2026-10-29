import { describe, expect, it } from 'vitest'
import { createTransportRequest } from './transport.mts'
import type { StructuredDecisionRequest } from '@vouchington/ai/structured-decisions'

const request: StructuredDecisionRequest = {
  state: 'State',
  questions: [{ id: 'q1', type: 'noul', question: 'Is it?' }],
}

describe('createTransportRequest model', () => {
  it.each([
    ['openai', 'gpt-6-luna'],
    ['openrouter', 'typesafe/jev-1.13'],
    ['typesafe', 'jev-latest'],
  ] as const)(
    'asks the %s transport its own decision model unless the caller names one',
    (transport, model) => {
      expect(createTransportRequest(transport, 'key', request).body.model).toBe(model)
    },
  )

  it.each(['openai', 'openrouter', 'typesafe'] as const)(
    'asks the classifier row model on the %s transport',
    transport => {
      expect(createTransportRequest(transport, 'key', request, 'row-model').body.model).toBe(
        'row-model',
      )
    },
  )
})
