import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PublicLandingPageHeader } from '../public-landing-page-header'
import '@/test-helpers/components/shared/markdown-highlighter.mock-support'

const mockImage = vi.hoisted(() => vi.fn<VitestLooseMock>().mockReturnValue(null))

vi.mock(import('@/components/shared/proxied-image'), () => ({ ProxiedImage: mockImage }))

describe('PublicLandingPageHeader', () => {
  it('preloads the profile image', () => {
    render(
      <PublicLandingPageHeader
        canonicalHref='/user/alex'
        displayName='Alex'
        profileImagePath='/images/alex'
        title='Links'
        username='alex'
      />,
    )

    expect(mockImage.mock.calls.at(-1)?.[0]).toMatchObject({
      src: '/images/alex',
      preload: true,
    })
  })

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
