import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EmbedPreview } from '@/lib/embeds/embed-preview'
import { EmbedPreviewCard } from '../embed-preview-card'

function preview(overrides: Partial<EmbedPreview> = {}): EmbedPreview {
  return {
    title: 'عنوان',
    description: 'وصف الصفحة',
    provider: 'Example',
    thumbnailUrl: null,
    sourceUrl: 'https://example.com/article',
    playerUrl: null,
    platform: null,
    rawMetaTags: null,
    ...overrides,
  }
}

describe('EmbedPreviewCard content language', () => {
  it('marks the title and description with the declared page language', () => {
    render(
      <EmbedPreviewCard
        preview={preview()}
        lang='ar'
      />,
    )

    const title = screen.getByText('عنوان')
    const description = screen.getByText('وصف الصفحة')
    expect(title).toHaveAttribute('lang', 'ar')
    expect(title).toHaveAttribute('dir', 'rtl')
    expect(description).toHaveAttribute('lang', 'ar')
    expect(description).toHaveAttribute('dir', 'rtl')
    expect(screen.getByText('Example')).not.toHaveAttribute('lang')
    expect(screen.getByText('Example')).not.toHaveAttribute('dir')
    expect(screen.getByRole('link', { name: 'Open source' })).not.toHaveAttribute('lang')
    expect(screen.getByRole('link', { name: 'Open source' })).not.toHaveAttribute('dir')
  })

  it('normalizes a regional page language tag', () => {
    render(
      <EmbedPreviewCard
        preview={preview({ title: 'Article', description: null, provider: null, sourceUrl: null })}
        lang='en-US'
      />,
    )

    const title = screen.getByText('Article')
    expect(title).toHaveAttribute('lang', 'en')
    expect(title).toHaveAttribute('dir', 'ltr')
  })

  it('keeps an unknown page language outside the UI locale', () => {
    render(
      <EmbedPreviewCard
        preview={preview({ title: 'Article', description: null, provider: null, sourceUrl: null })}
        lang={null}
      />,
    )

    const title = screen.getByText('Article')
    expect(title).not.toHaveAttribute('lang')
    expect(title).toHaveAttribute('dir', 'auto')
  })

  it('omits lang when the page language tag is not a supported content language', () => {
    render(
      <EmbedPreviewCard
        preview={preview({ title: 'Article', description: null, provider: null, sourceUrl: null })}
        lang='zz'
      />,
    )

    const title = screen.getByText('Article')
    expect(title).not.toHaveAttribute('lang')
    expect(title).toHaveAttribute('dir', 'auto')
  })
})
