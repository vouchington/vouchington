import { describe, expect, it } from 'vitest'
import { createStructuredDecisionClient } from './structured-decisions.mts'

describe('OpenRouter Decisions', () => {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''

  it.skipIf(!apiKey)('preserves native Jev Noul, Choice, and Score fields', async () => {
    const result = await createStructuredDecisionClient({ transport: 'openrouter', apiKey }).decide(
      {
        state: 'A short local food review about a bakery.',
        questions: [
          { id: 'spam', type: 'noul', question: 'Is this spam?' },
          {
            id: 'topic',
            type: 'choice',
            question: 'Choose the best topic.',
            criteria: ['food', 'sports'],
          },
          {
            id: 'quality',
            type: 'score',
            question: 'Score usefulness.',
            criteria: [
              { value: 0, description: 'low' },
              { value: 1, description: 'high' },
            ],
          },
        ],
      },
    )

    expect(result.model).toContain('typesafe/jev-1.13')
    expect(result.provider).toBe('TypeSafe')
    expect(result.answers).toHaveLength(3)
    const [noul, choice, score] = result.answers
    expect(noul).toMatchObject({ id: 'spam', type: 'noul' })
    if (noul?.type !== 'noul') throw new Error('Expected a Noul answer.')
    expect(noul.probability).toBeGreaterThanOrEqual(0)
    expect(noul.probability).toBeLessThanOrEqual(1)
    expect(noul).not.toHaveProperty('confidence')

    expect(choice).toMatchObject({ id: 'topic', type: 'choice' })
    if (choice?.type !== 'choice') throw new Error('Expected a Choice answer.')
    expect(['food', 'sports']).toContain(choice.choice)
    expect(choice.confidence).toBeGreaterThanOrEqual(0)
    expect(choice.confidence).toBeLessThanOrEqual(1)
    expect(Object.keys(choice.probabilities).sort()).toEqual(['food', 'sports'])
    expect(Object.values(choice.probabilities).every(value => value >= 0 && value <= 1)).toBe(true)
    expect(Object.values(choice.probabilities).reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      1,
    )

    expect(score).toMatchObject({ id: 'quality', type: 'score' })
    if (score?.type !== 'score') throw new Error('Expected a Score answer.')
    expect(score.score).toBeGreaterThanOrEqual(0)
    expect(score.score).toBeLessThanOrEqual(1)
    expect(score.confidence).toBeGreaterThanOrEqual(0)
    expect(score.confidence).toBeLessThanOrEqual(1)
    expect(score.legend).toEqual(['low', 'high'])
    expect(Object.keys(score.probabilities).sort()).toEqual(['0', '1'])
    expect(Object.values(score.probabilities).every(value => value >= 0 && value <= 1)).toBe(true)
    expect(Object.values(score.probabilities).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
  })
})
