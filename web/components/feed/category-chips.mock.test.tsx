import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CategoryChips } from './category-chips'
import { makeRssFeedItemCategory, makeRssFeedItemTopic } from '@/test-helpers/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

const nullCat = (category_text: string) => makeRssFeedItemCategory({ category_text })

const topicCat = (category_text: string, topic: ReturnType<typeof makeRssFeedItemTopic>) =>
  makeRssFeedItemCategory({ id: `rel-${topic.id}`, category_text, topic, votes_score_net: 1 })

describe('CategoryChips', () => {
  it('renders null for empty categories', () => {
    const { container } = render(<CategoryChips categories={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders wrapper and chip data-pw values', () => {
    const { container } = render(<CategoryChips categories={[nullCat('banking')]} />)

    expect(container.querySelector('[data-pw="category-chips"]')).not.toBeNull()
    // text-only chips render as <Badge> which carries data-pw='badge' by default
    expect(container.querySelector('[data-pw="badge"]')).not.toBeNull()
    expect(screen.getByText('banking')).toBeInTheDocument()
  })

  it('renders inline chips without wrapper', () => {
    const { container } = render(
      <CategoryChips
        inline
        categories={[nullCat('banking')]}
      />,
    )

    expect(container.querySelector('[data-pw="category-chips"]')).toBeNull()
    // text-only chips render as <Badge> which carries data-pw='badge' by default
    expect(container.querySelector('[data-pw="badge"]')).not.toBeNull()
  })

  it('deduplicates categories sharing the same topic id', () => {
    const topic = makeRssFeedItemTopic({
      id: '019e6d4c-8e14-740c-8de8-be11c790f1bb',
      name: 'AI',
      slug: 'ai',
      topic_type: 'tag',
    })
    const { container } = render(
      <CategoryChips
        categories={[topicCat('AI', topic), topicCat('artificial intelligence', topic)]}
      />,
    )
    expect(container.querySelectorAll('[data-pw="category-chip"]')).toHaveLength(1)
  })

  it('deduplicates categories with the same category_text and no topic', () => {
    const { container } = render(<CategoryChips categories={[nullCat('tech'), nullCat('tech')]} />)
    expect(container.querySelectorAll('[data-pw="badge"]')).toHaveLength(1)
  })

  it('suppresses plain-text badge when a topic chip covers the same text', () => {
    const topic = makeRssFeedItemTopic({
      id: '019e6d4c-8e14-740c-8de8-be11c790f1bb',
      name: 'AI',
      slug: 'ai',
      topic_type: 'tag',
    })
    const { container } = render(
      <CategoryChips categories={[topicCat('AI', topic), nullCat('AI')]} />,
    )
    expect(container.querySelectorAll('[data-pw="category-chip"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-pw="badge"]')).toHaveLength(0)
  })

  it('deduplicates plain-text badges case-insensitively', () => {
    const { container } = render(<CategoryChips categories={[nullCat('Tech'), nullCat('tech')]} />)
    expect(container.querySelectorAll('[data-pw="badge"]')).toHaveLength(1)
  })

  it('renders labels in a scrollable row without flex-wrap', () => {
    const { container } = render(<CategoryChips categories={[nullCat('banking')]} />)
    const wrapper = container.querySelector('[data-pw="category-chips"]')
    expect(wrapper?.className).toContain('overflow-x-auto')
    expect(wrapper?.className).toContain('scrollbar-hide')
    expect(wrapper?.className).not.toContain('flex-wrap')
  })

  it('renders topic-linked chips before free-text chips regardless of API order', () => {
    const categories = [
      nullCat('free-alpha'),
      topicCat(
        'ignored',
        makeRssFeedItemTopic({
          id: 'topic-1',
          name: 'Topic One',
          slug: 'topic-one',
          topic_type: 'topic',
        }),
      ),
      nullCat('free-beta'),
      topicCat(
        'ignored-2',
        makeRssFeedItemTopic({
          id: 'topic-2',
          name: 'Topic Two',
          slug: 'topic-two',
          topic_type: 'topic',
        }),
      ),
    ]
    render(<CategoryChips categories={categories} />)

    const topicOne = screen.getByText('Topic One')
    const topicTwo = screen.getByText('Topic Two')
    const freeAlpha = screen.getByText('free-alpha')
    const freeBeta = screen.getByText('free-beta')

    // topic chips must precede free-text chips in DOM order
    expect(
      topicOne.compareDocumentPosition(freeAlpha) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      topicOne.compareDocumentPosition(freeBeta) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      topicTwo.compareDocumentPosition(freeAlpha) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      topicTwo.compareDocumentPosition(freeBeta) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
