import type { ReactNode } from 'react'

export function createNextLinkMock(): typeof import('next/link') {
  return {
    default: ({
      children,
      href,
      ...props
    }: {
      children: ReactNode
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
  } as unknown as typeof import('next/link')
}

// Resolve dynamic imports in jsdom, and let a FollowButton mock intercept the loaded component.
export function createNextDynamicMock(): typeof import('next/dynamic') {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
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
  } as unknown as typeof import('next/dynamic')
}
