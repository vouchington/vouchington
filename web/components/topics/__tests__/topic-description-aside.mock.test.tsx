import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { TopicDescriptionAside } from '@/components/topics/topic-description-aside'
import type { TopicContentUpdate } from '@/types/topics'
import type { useTranslations } from '@/lib/i18n/use-translations'

vi.mock(
  import('@/components/shared/markdown-content'),
  () =>
    ({
      MarkdownContent: ({
        html,
        features,
        lang,
      }: {
        html: string
        features?: unknown
        lang?: string
      }) => (
        <div
          data-testid='markdown-content'
          data-html={html}
          data-features={features !== undefined ? JSON.stringify(features) : ''}
          data-lang={lang ?? ''}
        />
      ),
    }) as unknown as typeof import('@/components/shared/markdown-content'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

function makeContentUpdate(overrides?: Partial<TopicContentUpdate>): TopicContentUpdate {
  return {
    updated_at: '2026-05-05T00:00:00.000Z',
    updated_by: {
      id: 'user-1',
      username: 'jong',
      display_account: null,
    },
    ...overrides,
  }
}

describe('TopicDescriptionAside', () => {
  let t: ReturnType<typeof useTranslations>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('renders the about card with markdown content', () => {
    render(
      <TopicDescriptionAside
        t={t}
        html='<p>About content</p>'
        topicName='Trade'
      />,
    )

    expect(screen.getByText('About Trade')).toBeInTheDocument()
    const content = screen.getByTestId('markdown-content')
    expect(content).toHaveAttribute('data-html', '<p>About content</p>')
    expect(content).toHaveAttribute('data-features', '{"utm":true}')
  })

  it('renders the updated-by line alongside the description', () => {
    render(
      <TopicDescriptionAside
        t={t}
        html='<p>About content</p>'
        topicName='Trade'
        contentUpdate={makeContentUpdate()}
      />,
    )

    expect(screen.getByText('About Trade')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument()
    expect(screen.getByText(/Updated on May 5, 2026 by/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'jong' })
    expect(link).toHaveAttribute('href', '/user/jong')
  })

  it('passes detected topic content language to markdown content', () => {
    render(
      <TopicDescriptionAside
        t={t}
        html='<p>A propos</p>'
        topicName='Trade'
        contentLanguage='fr'
      />,
    )

    expect(screen.getByTestId('markdown-content')).toHaveAttribute('data-lang', 'fr')
  })

  it('prefers display_account.name over username for the updater link', () => {
    render(
      <TopicDescriptionAside
        t={t}
        html=''
        topicName='Trade'
        contentUpdate={makeContentUpdate({
          updated_by: {
            id: 'user-1',
            username: 'jong',
            display_account: { name: 'Jong M.' },
          },
        })}
      />,
    )

    expect(screen.getByRole('link', { name: 'Jong M.' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'jong' })).not.toBeInTheDocument()
  })

  it('renders the card with only the updated-by line when there is no html', () => {
    render(
      <TopicDescriptionAside
        t={t}
        html=''
        topicName='Trade'
        contentUpdate={makeContentUpdate()}
      />,
    )

    expect(screen.getByText('About Trade')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument()
    expect(screen.getByText(/Updated on May 5, 2026 by/)).toBeInTheDocument()
  })

  it('returns null when there is neither html nor a content update', () => {
    const { container } = render(
      <TopicDescriptionAside
        t={t}
        html=''
        topicName='Trade'
        contentUpdate={null}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
