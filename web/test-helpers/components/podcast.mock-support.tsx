import { configure } from '@testing-library/react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { vi } from 'vitest'

configure({ testIdAttribute: 'data-pw' })

vi.mock(import('next/image'), () => {
  const Img = 'img' as const

  return {
    default: ({
      src,
      alt,
      ...props
    }: {
      src: string
      alt: string
      width: number
      height: number
      className?: string
      'data-pw'?: string
    }) => (
      <Img
        src={src}
        alt={alt}
        {...props}
      />
    ),
  } as unknown as typeof import('next/image')
})

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        href,
        children,
        ...props
      }: {
        href: string
        children: React.ReactNode
        prefetch?: boolean
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Mic: () => <svg data-pw='mic-icon' />,
    Lock: () => <svg data-pw='lock-icon' />,
  }),
)
