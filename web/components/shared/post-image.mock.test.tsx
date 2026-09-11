import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PostImage } from './post-image'

vi.mock(import('next/image'), () => {
  return {
    default: ({ unoptimized, ...props }: Record<string, unknown>) =>
      React.createElement('img', {
        ...props,
        'data-unoptimized': String(Boolean(unoptimized)),
      }),
  } as unknown as typeof import('next/image')
})

describe('PostImage', () => {
  it('renders a Next image with the generated image-lambda URL', () => {
    render(
      <PostImage
        imageId='image-123'
        width={320}
        alt='Example image'
      />,
    )

    const image = screen.getByAltText('Example image')
    expect(image).toHaveAttribute('src', '/images/image-123?w=320')
    expect(image).toHaveAttribute('width', '320')
    expect(image).toHaveAttribute('height', '320')
    expect(image).toHaveAttribute('data-unoptimized', 'true')
    expect(image).toHaveAttribute('data-pw', 'post-image')
  })

  it('respects an explicit height', () => {
    render(
      <PostImage
        imageId='image-456'
        width={640}
        height={240}
        alt='Wide image'
      />,
    )

    expect(screen.getByAltText('Wide image')).toHaveAttribute('height', '240')
  })
})
