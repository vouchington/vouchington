import { describe, expect, it } from 'vitest'
import { prepareModerationInput } from './openai-moderation.mts'

describe('prepareModerationInput', () => {
  it('includes image captions for moderator context', () => {
    const input = prepareModerationInput('Misleading title', 'Body text', [
      'Image 1 caption: Luxury suite photo',
      'Image 2 caption: Basic room receipt',
    ])

    expect(input).toContain('Title: Misleading title')
    expect(input).toContain('Content: Body text')
    expect(input).toContain('Images:')
    expect(input).toContain('- Image 1 caption: Luxury suite photo')
    expect(input).toContain('- Image 2 caption: Basic room receipt')
  })
})
