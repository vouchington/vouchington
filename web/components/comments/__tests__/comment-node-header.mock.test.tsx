import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CommentNodeHeader } from '@/components/comments/comment-node-header'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { seedMessages } from '@/lib/i18n/use-translations'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import { commentPermalink, deletedCommentNode } from '@/storybook/comments/comment-story-data'

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuKebab: () => <div data-pw='report-menu-kebab' />,
}))

const cases = [
  ['en', 0, '0 replies'],
  ['en', 1, '1 reply'],
  ['en', 2, '2 replies'],
  ['en', 1000, '1,000 replies'],
  ['es', 0, '0 respuestas'],
  ['es', 1, '1 respuesta'],
  ['es', 2, '2 respuestas'],
  ['fr', 0, '0 réponse'],
  ['fr', 1, '1 réponse'],
  ['fr', 2, '2 réponses'],
  ['fr', 1000, '1\u202f000 réponses'],
  ['pt', 0, '0 resposta'],
  ['pt', 1, '1 resposta'],
  ['pt', 2, '2 respostas'],
  ['pt', 1000, '1.000 respostas'],
] as const

function hasPhrase(text: string, expected: string): boolean {
  const normalized = text.replace(/\s+/gu, ' ')
  const phrase = expected.replace(/\s+/gu, ' ')
  return new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$| )`).test(
    normalized,
  )
}

describe('CommentNodeHeader collapsed reply count', () => {
  beforeAll(async () => {
    for (const locale of ['es', 'fr', 'pt'] as const) {
      seedMessages(locale, await loadJsonMessages(locale))
    }
  })

  it.each(cases)('formats %s count %s as %s', (locale, childrenCount, expected) => {
    render(
      <UiLocaleContext.Provider value={locale}>
        <CommentNodeHeader
          childrenCount={childrenCount}
          hideDownCount
          isAnonymous={false}
          isCollapsed
          isDeleted
          node={deletedCommentNode}
          onToggleCollapse={() => undefined}
          permalink={commentPermalink}
          username='deleted'
        />
      </UiLocaleContext.Provider>,
    )

    const count = screen.getByText((_, element) => {
      return (
        element?.tagName === 'SPAN' &&
        element.classList.contains('ml-1') &&
        hasPhrase(element.textContent ?? '', expected)
      )
    })
    expect(count).toBeInTheDocument()
    expect(count.textContent).not.toContain('children')
    expect(count.textContent).not.toContain('{count}')
  })
})
