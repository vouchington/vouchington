import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scrollAreaStories = readFileSync(
  'web/storybook/design-system/scroll-area.stories.tsx',
  'utf8',
)
const topicRecommendationStories = readFileSync(
  'web/storybook/entities/topic-recommendations.stories.tsx',
  'utf8',
)

describe('remediated Storybook accessibility suppressions', () => {
  it('keeps ScrollArea stories free of accessibility overrides', () => {
    expect(scrollAreaStories).not.toContain('a11y')
    expect(scrollAreaStories).not.toContain('scrollable-region-focusable')
  })

  it('keeps topic recommendation stories free of remediated rule overrides', () => {
    expect(topicRecommendationStories).not.toContain('a11y')
    expect(topicRecommendationStories).not.toContain('color-contrast')
    expect(topicRecommendationStories).not.toContain('scrollable-region-focusable')
  })
})
