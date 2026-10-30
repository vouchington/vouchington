import { render, screen } from '@testing-library/react'
import { formatUtcDate } from '@ts-shared/utils/format'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NewsItemHeader } from '@/components/news/news-item-header'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'
import { makeRssFeedItem } from '@/test-helpers/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        href: string
        children: ReactNode
        prefetch?: boolean
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

const publishedAt = '2025-01-15T10:00:00.000Z'
const uiLocales = ['es', 'fr', 'pt'] as const

const item = makeRssFeedItem({
  published_at: publishedAt,
  categories: [],
})

describe('NewsItemHeader published date', () => {
  it.each(uiLocales)('formats the published date in the %s UI locale', locale => {
    const localizedDate = formatUtcDate(publishedAt, locale)
    expect(localizedDate).not.toBe(formatUtcDate(publishedAt))

    render(
      <LocaleProvider locale={locale}>
        <NewsItemHeader item={item} />
      </LocaleProvider>,
    )

    expect(screen.getByText(localizedDate)).toBeInTheDocument()
  })
})
