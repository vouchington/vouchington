import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MARKDOWN_CONTENT_FEATURES_UTM } from '@/components/shared/markdown-content-features'
import { UserBioCopy } from '../user-bio-copy'

describe('UserBioCopy', () => {
  it('sets lang and dir from the detected bio language', () => {
    const { container } = render(
      <UserBioCopy
        html='<p>نبذة</p>'
        detectedLanguage='ar'
        features={MARKDOWN_CONTENT_FEATURES_UTM}
      />,
    )

    const bio = container.querySelector('[lang]')
    expect(bio).toHaveAttribute('lang', 'ar')
    expect(bio).toHaveAttribute('dir', 'rtl')
    expect(bio).toHaveTextContent('نبذة')
  })

  it('normalizes a regional detected tag onto the bio', () => {
    const { container } = render(
      <UserBioCopy
        markdown='Bonjour'
        detectedLanguage='fr-CA'
      />,
    )

    const bio = container.querySelector('[lang]')
    expect(bio).toHaveAttribute('lang', 'fr')
    expect(bio).toHaveAttribute('dir', 'ltr')
    expect(bio).toHaveTextContent('Bonjour')
  })

  it('leaves an unknown detected language unmarked', () => {
    const { container } = render(
      <UserBioCopy
        html='<p>Hello</p>'
        detectedLanguage='und'
      />,
    )

    expect(container.querySelector('[lang]')).toBeNull()
    expect(container.querySelector('[dir]')).toHaveAttribute('dir', 'auto')
  })

  it('renders nothing for blank bio text', () => {
    const { container } = render(
      <UserBioCopy
        html='   '
        markdown='  '
        detectedLanguage='ar'
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
