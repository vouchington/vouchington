import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RssFeedItemTitle } from '../rss-feed-item-title'

describe('RssFeedItemTitle', () => {
  it('uses the detected item language', () => {
    render(
      <RssFeedItemTitle
        title='عنوان'
        detectedLanguage='ar'
      />,
    )

    const title = screen.getByText('عنوان')
    expect(title).toHaveAttribute('lang', 'ar')
    expect(title).toHaveAttribute('dir', 'rtl')
  })

  it('normalizes a regional detected language tag', () => {
    render(
      <RssFeedItemTitle
        title='Article'
        detectedLanguage='en-US'
      />,
    )

    const title = screen.getByText('Article')
    expect(title).toHaveAttribute('lang', 'en')
    expect(title).toHaveAttribute('dir', 'ltr')
  })

  it('keeps an unknown language outside the UI locale', () => {
    render(
      <RssFeedItemTitle
        title='Article'
        detectedLanguage={null}
      />,
    )

    const title = screen.getByText('Article')
    expect(title).not.toHaveAttribute('lang')
    expect(title).toHaveAttribute('dir', 'auto')
  })

  it('leaves a UI fallback unmarked', () => {
    render(
      <RssFeedItemTitle
        title='   '
        detectedLanguage='ar'
        fallback='Untitled'
      />,
    )

    const fallback = screen.getByText('Untitled')
    expect(fallback).not.toHaveAttribute('lang')
    expect(fallback).not.toHaveAttribute('dir')
  })

  it('renders nothing when the title and fallback are blank', () => {
    const { container } = render(
      <RssFeedItemTitle
        title={null}
        detectedLanguage='fr'
        fallback=''
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
