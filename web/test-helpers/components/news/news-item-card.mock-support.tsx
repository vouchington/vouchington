/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import { createUserPathname } from '@/lib/links/entity-href'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { vi } from 'vitest'

const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      // oxlint-disable-next-line react/only-export-components -- next/dynamic test double, never fast-refreshed
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          void loader().then((mod: unknown) => {
            if (active)
              setDynamicComponent(() =>
                typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
              )
          })
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  }
})
vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setPathname('/news')
mockNav.setSearchParams('topics=travel')

vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
      useOptionalAuth: () => null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
        [k: string]: unknown
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

vi.mock(import('next/image'), () => {
  const Img = 'img' as const

  return {
    default: ({
      src,
      alt,
      width,
      height,
      className,
    }: {
      src: string
      alt: string
      width: number
      height: number
      className?: string
    }) => (
      <Img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
      />
    ),
  } as unknown as typeof import('next/image')
})

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: ({ className }: { className?: string }) => (
    <div
      data-testid='follower-share-actions'
      className={className}
    />
  ),
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: ({ sharedByUser }: { sharedByUser?: { username?: string } }) =>
    sharedByUser?.username ? (
      <div>
        <span>Shared by</span>{' '}
        <a href={createUserPathname(sharedByUser.username)}>@{sharedByUser.username}</a>
      </div>
    ) : null,
}))
