import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Post } from '@/types/posts'
import type { Topic } from '@/types/topics'
import { EMPTY_RESULTS } from '../../command-search-data'
import type { CommandItemLabel } from '../command-link-item'
import { ResultGroups } from '../result-groups'

vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      CommandGroup: ({
        children,
        heading,
        ...props
      }: {
        children: ReactNode
        heading: string
        [key: string]: unknown
      }) => (
        <section
          aria-label={heading}
          {...props}
        >
          {children}
        </section>
      ),
      CommandItem: ({
        children,
        onSelect,
        ...props
      }: {
        children: ReactNode
        onSelect?: () => void
        [key: string]: unknown
      }) => (
        <button
          type='button'
          onClick={onSelect}
          {...props}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/command'),
)

vi.mock(import('../result-groups-extra'), () => ({
  CommunityResults: () => null,
  DomainResults: () => null,
  FediverseResults: () => null,
  NewsResults: () => null,
}))

vi.mock(import('../command-link-item'), () => ({
  CommandLinkItem: ({
    href,
    dataPw,
    label,
    onOpenChange,
    pushRoute,
  }: {
    href: string
    dataPw?: string
    label: CommandItemLabel
    sublabel: string
    onOpenChange: (open: boolean) => void
    pushRoute?: (href: string) => void
  }) => (
    <button
      type='button'
      data-pw={dataPw}
      onClick={() => {
        pushRoute?.(href)
        onOpenChange(false)
      }}
    >
      {label.kind === 'ui-text' ? label.text : label.content.text}
    </button>
  ),
}))

describe('ResultGroups', () => {
  it('renders page shortcut data-pw values from search data', () => {
    const onOpenChange = vi.fn<VitestLooseMock>()
    const pushRoute = vi.fn<VitestLooseMock>()
    const { container } = render(
      <ResultGroups
        activeTab='pages'
        matchedShortcuts={[
          {
            href: '/plans',
            label: 'extracted.navigation.derivePageShortcuts.plans_dfe8b2f0',
            dataPw: 'search-page-shortcut-plans',
          },
        ]}
        results={EMPTY_RESULTS}
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
      />,
    )

    expect(container.querySelector('[data-pw="search-page-shortcut-plans"]')).not.toBeNull()
    fireEvent.click(screen.getByText('Plans'))
    expect(pushRoute).toHaveBeenCalledWith('/plans')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders topic results and navigates to topic href', () => {
    const onOpenChange = vi.fn<VitestLooseMock>()
    const pushRoute = vi.fn<VitestLooseMock>()
    const topic = {
      id: 'topic-1',
      name: 'Test Card',
      topic_type: 'card',
      slug: 'test-card',
    } as unknown as Topic

    render(
      <ResultGroups
        activeTab='topics'
        matchedShortcuts={[]}
        results={{ ...EMPTY_RESULTS, topics: [topic] }}
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
      />,
    )

    expect(screen.getByText('Test Card')).not.toBeNull()
    fireEvent.click(screen.getByText('Test Card'))
    expect(pushRoute).toHaveBeenCalledWith('/card/test-card')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders post results and navigates to post href', () => {
    const onOpenChange = vi.fn<VitestLooseMock>()
    const pushRoute = vi.fn<VitestLooseMock>()
    const post = {
      id: 'post-1',
      title: 'Test Article',
      post_type: 'article',
      markdown: '',
      declared_language: 'ar',
      lingua_rs_detected_language: 'en',
    } as unknown as Post

    render(
      <ResultGroups
        activeTab='posts'
        matchedShortcuts={[]}
        results={{ ...EMPTY_RESULTS, posts: [post] }}
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
      />,
    )

    expect(screen.getByText('Test Article')).not.toBeNull()
    fireEvent.click(screen.getByText('Test Article'))
    expect(pushRoute).toHaveBeenCalledWith('/article/post-1')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
