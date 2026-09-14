import { describe, expect, it } from 'vitest'

import {
  EXCLUSIONS_FILE,
  formatMissingComponentsMessage,
  formatNamespaceImportsMessage,
} from '../../test-helpers/storybook/component-story-coverage/message'

describe('component-story-coverage-message', () => {
  describe('formatMissingComponentsMessage', () => {
    it('returns empty string for empty array', () => {
      expect(formatMissingComponentsMessage([])).toBe('')
    })

    it('names the exclusions file path', () => {
      const msg = formatMissingComponentsMessage([
        { component: 'MyCard', export: 'MyCard', file: 'web/components/cards/my-card.tsx' },
      ])
      expect(msg).toContain(EXCLUSIONS_FILE)
    })

    it('includes the file#export key for each missing component', () => {
      const msg = formatMissingComponentsMessage([
        { component: 'MyCard', export: 'MyCard', file: 'web/components/cards/my-card.tsx' },
      ])
      expect(msg).toContain('web/components/cards/my-card.tsx#MyCard')
    })

    it('does not suggest adding exclusions', () => {
      const msg = formatMissingComponentsMessage([
        { component: 'FeedAside', export: 'FeedAside', file: 'web/components/feed/feed-aside.tsx' },
      ])
      expect(msg).toContain('zero-exclusion ratchet')
      expect(msg).not.toContain('Example exclusion')
    })

    it("instructs to use 'default' for default exports", () => {
      const msg = formatMissingComponentsMessage([
        { component: 'Layout', export: 'default', file: 'web/components/layout.tsx' },
      ])
      expect(msg).toContain("'default'")
      expect(msg).toContain('web/components/layout.tsx#default')
    })

    it('lists all missing components', () => {
      const msg = formatMissingComponentsMessage([
        { component: 'Alpha', export: 'Alpha', file: 'web/components/alpha.tsx' },
        { component: 'Beta', export: 'Beta', file: 'web/components/beta.tsx' },
      ])
      expect(msg).toContain('web/components/alpha.tsx#Alpha')
      expect(msg).toContain('web/components/beta.tsx#Beta')
    })

    it('instructs developers to add Storybook coverage', () => {
      const msg = formatMissingComponentsMessage([
        { component: 'Foo', export: 'Foo', file: 'web/components/foo.tsx' },
      ])
      expect(msg).toContain('add a story')
      expect(msg).toContain('web/storybook/')
    })
  })

  describe('formatNamespaceImportsMessage', () => {
    it('returns empty string for empty array', () => {
      expect(formatNamespaceImportsMessage([])).toBe('')
    })

    it('shows the file and the namespace import', () => {
      const msg = formatNamespaceImportsMessage([
        {
          file: 'web/storybook/buttons.stories.tsx',
          source: '@/components/ui/button',
          local: 'Buttons',
        },
      ])
      expect(msg).toContain('web/storybook/buttons.stories.tsx')
      expect(msg).toContain('* as Buttons')
      expect(msg).toContain('@/components/ui/button')
    })

    it('instructs to use named imports', () => {
      const msg = formatNamespaceImportsMessage([
        { file: 'web/storybook/foo.stories.tsx', source: '@/components/foo', local: 'Foo' },
      ])
      expect(msg).toContain('named imports')
    })
  })
})
