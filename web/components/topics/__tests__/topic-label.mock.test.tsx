import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { TopicLabel } from '../topic-label'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

const baseTopic = { id: 'abc', slug: 'foo', topic_type: 'topic', name: 'Foo Topic' }

describe('TopicLabel', () => {
  it('links to topic root when no tab', () => {
    const { container } = render(<TopicLabel topic={baseTopic} />)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/topic/foo')
  })

  it('appends tab to href', () => {
    const { container } = render(
      <TopicLabel
        topic={baseTopic}
        tab='reviews'
      />,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/topic/foo/reviews')
  })

  it('appends news tab', () => {
    const { container } = render(
      <TopicLabel
        topic={baseTopic}
        tab='news'
      />,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/topic/foo/news')
  })

  it('appends posts tab', () => {
    const { container } = render(
      <TopicLabel
        topic={baseTopic}
        tab='posts'
      />,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/topic/foo/posts')
  })

  it('appends data-points tab', () => {
    const { container } = render(
      <TopicLabel
        topic={baseTopic}
        tab='data-points'
      />,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/topic/foo/data-points')
  })

  it('renders topic name as default child', () => {
    const { getByText } = render(<TopicLabel topic={baseTopic} />)
    expect(getByText('Foo Topic')).toBeTruthy()
  })

  it('renders custom children', () => {
    const { getByText } = render(<TopicLabel topic={baseTopic}>Custom Label</TopicLabel>)
    expect(getByText('Custom Label')).toBeTruthy()
  })

  it('uses id when slug is null', () => {
    const { container } = render(
      <TopicLabel
        topic={{ ...baseTopic, slug: null }}
        tab='news'
      />,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/topic/abc/news')
  })

  it('maps rss_feed topic_type to source slug', () => {
    const { container } = render(
      <TopicLabel
        topic={{
          id: 'src1',
          slug: 'my-feed',
          topic_type: 'rss_feed',
          name: 'My Feed',
        }}
        tab='news'
      />,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/source/my-feed/news')
  })

  it('has data-pw topic-label', () => {
    const { container } = render(<TopicLabel topic={baseTopic} />)
    expect(container.firstElementChild?.getAttribute('data-pw')).toBe('topic-label')
  })

  it('uses compact focus-visible styling without a ring offset', () => {
    const { container } = render(<TopicLabel topic={baseTopic} />)
    expect(container.firstElementChild).toHaveClass(
      'focus-visible:ring-1',
      'focus-visible:ring-ring',
    )
    expect(container.firstElementChild).not.toHaveClass('focus:ring-2', 'focus:ring-offset-2')
  })
})
