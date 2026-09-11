import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProxiedImage } from '../proxied-image'

vi.mock(
  import('next/image'),
  () =>
    ({
      default: ({ src, alt, unoptimized }: { src: string; alt: string; unoptimized?: boolean }) => (
        <span
          data-testid='mock-next-image'
          data-src={src}
          aria-label={alt}
          data-unoptimized={String(Boolean(unoptimized))}
        />
      ),
    }) as unknown as typeof import('next/image'),
)

describe('ProxiedImage', () => {
  it('renders with a sideload-proxied src without throwing', () => {
    render(
      <ProxiedImage
        src='/sideload/aHR0cHM6Ly9leGFtcGxlLmNvbS9pbWcucG5n?w=400'
        alt='test image'
        width={400}
        height={300}
      />,
    )
    expect(screen.getByTestId('mock-next-image')).toBeInTheDocument()
  })

  it('renders with a relative src without throwing', () => {
    render(
      <ProxiedImage
        src='/images/logo.png'
        alt='logo'
        width={200}
        height={100}
      />,
    )
    expect(screen.getByTestId('mock-next-image')).toBeInTheDocument()
  })

  it('bypasses Next optimization for an absolute image-origin sideload URL', () => {
    window.__IMAGE_ORIGIN__ = 'https://images.example.com'
    render(
      <ProxiedImage
        src='https://images.example.com/sideload/abc?sig=test&w=400'
        alt='proxied image'
        width={400}
        height={300}
      />,
    )
    expect(screen.getByTestId('mock-next-image')).toHaveAttribute('data-unoptimized', 'true')
    delete window.__IMAGE_ORIGIN__
  })
})
