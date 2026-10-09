import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PublicLandingPageHeader } from '../public-landing-page-header'

describe('PublicLandingPageHeader', () => {
  it('marks the landing-page bio with the detected content language', () => {
    const { container } = render(
      <PublicLandingPageHeader
        canonicalHref='/user/alex'
        displayName='Alex'
        profileImagePath={null}
        title='Links'
        userMarkdown='Bonjour'
        detectedLanguage='fr-CA'
        username='alex'
      />,
    )

    const bio = container.querySelector('[lang]')
    expect(bio).toHaveAttribute('lang', 'fr')
    expect(bio).toHaveAttribute('dir', 'ltr')
    expect(bio).toHaveTextContent('Bonjour')
  })

  it('leaves the landing-page bio unmarked when detection is absent', () => {
    const { container } = render(
      <PublicLandingPageHeader
        canonicalHref='/user/alex'
        displayName='Alex'
        profileImagePath={null}
        title='Links'
        userMarkdown='Hello'
        detectedLanguage={null}
        username='alex'
      />,
    )

    expect(container.querySelector('[lang]')).toBeNull()
    expect(container.querySelector('pre')).toHaveAttribute('dir', 'auto')
  })
})
