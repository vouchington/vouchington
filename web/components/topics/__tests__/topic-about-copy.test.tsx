import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TopicAboutCopy } from '../topic-about-copy'

describe('TopicAboutCopy', () => {
  it('uses the detected topic language', () => {
    render(
      <TopicAboutCopy
        markdown='Description en francais'
        detectedLanguage='fr'
      />,
    )

    const description = screen.getByText('Description en francais')
    expect(description).toHaveAttribute('lang', 'fr')
    expect(description).toHaveAttribute('dir', 'ltr')
  })

  it('normalizes a regional detected language tag', () => {
    render(
      <TopicAboutCopy
        markdown='About this topic'
        detectedLanguage='en-US'
      />,
    )

    const description = screen.getByText('About this topic')
    expect(description).toHaveAttribute('lang', 'en')
    expect(description).toHaveAttribute('dir', 'ltr')
  })

  it('keeps an unknown language outside the UI locale', () => {
    render(
      <TopicAboutCopy
        markdown='Unknown language description'
        detectedLanguage='und'
      />,
    )

    const description = screen.getByText('Unknown language description')
    expect(description).not.toHaveAttribute('lang')
    expect(description).toHaveAttribute('dir', 'auto')
  })

  it('renders nothing for blank about text', () => {
    const { container } = render(
      <TopicAboutCopy
        markdown='   '
        detectedLanguage='ar'
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the topic card excerpt length', () => {
    const markdown = 'a'.repeat(240)
    render(
      <TopicAboutCopy
        markdown={markdown}
        detectedLanguage='en'
      />,
    )

    expect(screen.getByText('a'.repeat(200))).toBeInTheDocument()
  })
})
