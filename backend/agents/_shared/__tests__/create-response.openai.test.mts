import { describe, expect, it } from 'vitest'
import { createOpenAIResponse, streamOpenAIResponse } from '../create-response.mts'
import { tryExtractText } from '../run-tool-loop.mts'
import { DEFAULT_AGENT_MODEL } from '../models.mts'

describe('agents._shared.create-response', () => {
  /**
   * Credentialed happy-path test for the OpenAI Responses API primitive.
   * Other agent-level OpenAI tests live in their agent's __tests__ directory.
   */

  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)

  it.skipIf(!hasOpenAIKey)(
    'createOpenAIResponse returns a non-empty text response',
    /* no-mistakes: integration=openai */
    async () => {
      const response = await createOpenAIResponse({
        model: DEFAULT_AGENT_MODEL,
        input: 'Reply with the single word OK and nothing else.',
      })
      expect(response).toBeDefined()
      expect(typeof response.output_text).toBe('string')
      expect((response.output_text as string).length).toBeGreaterThan(0)
    },
    120_000,
  )
})

describe('streamOpenAIResponse', () => {
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)

  it.skipIf(!hasOpenAIKey)(
    'streams deltas and returns a completed response',
    /* no-mistakes: integration=openai */
    async () => {
      const gen = streamOpenAIResponse({
        model: DEFAULT_AGENT_MODEL,
        input: 'Say "hello" in exactly one word.',
        instructions: 'Be concise.',
      })
      const deltas: string[] = []
      let step = await gen.next()
      while (!step.done) {
        expect(typeof step.value.delta).toBe('string')
        deltas.push(step.value.delta)
        step = await gen.next()
      }
      const response = step.value
      expect(deltas.length).toBeGreaterThan(0)
      const fullText = deltas.join('')
      expect(tryExtractText(response)).toBe(fullText)
    },
    120_000,
  )
})
