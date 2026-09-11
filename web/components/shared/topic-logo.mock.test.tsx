import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopicLogo } from './topic-logo'

vi.mock(import('next/image'), () => {
  return {
    default: ({ unoptimized, ...props }: Record<string, unknown>) =>
      React.createElement('img', {
        ...props,
        'data-unoptimized': String(Boolean(unoptimized)),
      }),
  } as unknown as typeof import('next/image')
})

describe('TopicLogo', () => {
  it('renders a Next image with the fixed topic logo dimensions', () => {
    render(
      <TopicLogo
        imageId='logo-123'
        name='Test Card'
      />,
    )

    const image = screen.getByAltText('Test Card logo')
    expect(image).toHaveAttribute('src', '/images/logo-123?w=200')
    expect(image).toHaveAttribute('width', '200')
    expect(image).toHaveAttribute('height', '200')
    expect(image).toHaveAttribute('data-unoptimized', 'true')
    expect(image).toHaveAttribute('data-pw', 'topic-logo')
    expect(image).toHaveClass('h-16', 'w-16', 'object-contain')
  })
})
