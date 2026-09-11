import Link from 'next/link'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PostContentText } from '../post-content-text'

describe('PostContentText', () => {
  it('uses the declared RTL language before detection', () => {
    render(
      <PostContentText
        as='p'
        content={{ text: 'مرحبا', declared_language: 'ar', lingua_rs_detected_language: 'en' }}
      />,
    )

    expect(screen.getByText('مرحبا')).toHaveAttribute('lang', 'ar')
    expect(screen.getByText('مرحبا')).toHaveAttribute('dir', 'rtl')
  })

  it('uses the detected LTR language when declaration is absent', () => {
    render(
      <PostContentText
        as='p'
        content={{ text: 'Bonjour', declared_language: null, lingua_rs_detected_language: 'fr' }}
      />,
    )

    expect(screen.getByText('Bonjour')).toHaveAttribute('lang', 'fr')
    expect(screen.getByText('Bonjour')).toHaveAttribute('dir', 'ltr')
  })

  it('uses automatic direction without a language for unknown content', () => {
    render(
      <PostContentText
        as='p'
        content={{ text: 'Text', declared_language: 'unknown', lingua_rs_detected_language: null }}
      />,
    )

    expect(screen.getByText('Text')).not.toHaveAttribute('lang')
    expect(screen.getByText('Text')).toHaveAttribute('dir', 'auto')
  })

  it('renders blank or null content fallback without content attributes', () => {
    render(
      <PostContentText
        as='h3'
        content={{ text: '   ', declared_language: 'ar' }}
        fallback='Untitled post'
      />,
    )

    expect(screen.getByText('Untitled post')).not.toHaveAttribute('lang')
    expect(screen.getByText('Untitled post')).not.toHaveAttribute('dir')

    render(
      <PostContentText
        as='p'
        content={{ text: null, declared_language: 'ar' }}
        fallback='Missing post'
      />,
    )

    expect(screen.getByText('Missing post')).not.toHaveAttribute('lang')
    expect(screen.getByText('Missing post')).not.toHaveAttribute('dir')
  })

  it('preserves the requested heading and Link hosts without a wrapper', () => {
    const { container } = render(
      <>
        <PostContentText
          as='h3'
          content={{ text: 'Heading' }}
        />
        <PostContentText
          as={Link}
          href='/posts/1'
          content={{ text: 'Linked post' }}
        />
      </>,
    )

    expect(container.querySelectorAll('h3')).toHaveLength(1)
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Linked post' })).toHaveAttribute('href', '/posts/1')
  })
})
