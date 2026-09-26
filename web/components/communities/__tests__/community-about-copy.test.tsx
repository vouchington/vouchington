import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommunityAboutCopy } from '../community-about-copy'

describe('CommunityAboutCopy', () => {
  it('uses the declared community language before detection', () => {
    render(
      <CommunityAboutCopy
        markdown='وصف المجتمع'
        defaultLanguage='ar'
        detectedLanguage='en'
      />,
    )

    const description = screen.getByText('وصف المجتمع')
    expect(description).toHaveAttribute('lang', 'ar')
    expect(description).toHaveAttribute('dir', 'rtl')
  })

  it('uses the detected language when the community has no default', () => {
    render(
      <CommunityAboutCopy
        markdown='Description en francais'
        defaultLanguage={null}
        detectedLanguage='fr'
      />,
    )

    const description = screen.getByText('Description en francais')
    expect(description).toHaveAttribute('lang', 'fr')
    expect(description).toHaveAttribute('dir', 'ltr')
  })

  it('normalizes a regional default language tag onto the content paragraph', () => {
    render(
      <CommunityAboutCopy
        markdown='About this community'
        defaultLanguage='en-US'
        detectedLanguage='fr'
      />,
    )

    const description = screen.getByText('About this community')
    expect(description).toHaveAttribute('lang', 'en')
    expect(description).toHaveAttribute('dir', 'ltr')
  })

  it('keeps an unknown language outside the UI locale', () => {
    render(
      <CommunityAboutCopy
        markdown='Unknown language description'
        defaultLanguage='und'
        detectedLanguage={null}
      />,
    )

    const description = screen.getByText('Unknown language description')
    expect(description).not.toHaveAttribute('lang')
    expect(description).toHaveAttribute('dir', 'auto')
  })

  it('leaves the UI empty label unmarked', () => {
    const { container } = render(
      <CommunityAboutCopy
        markdown='   '
        defaultLanguage='ar'
        detectedLanguage='en'
        emptyLabel='No description yet.'
      />,
    )

    const empty = screen.getByText('No description yet.')
    expect(empty).not.toHaveAttribute('lang')
    expect(empty).not.toHaveAttribute('dir')
    expect(container.querySelector('[lang]')).toBeNull()
  })

  it('renders nothing when blank about text has no empty label', () => {
    const { container } = render(
      <CommunityAboutCopy
        markdown={null}
        defaultLanguage='ar'
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
