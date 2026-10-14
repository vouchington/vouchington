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

// Loader promises started by next/dynamic test doubles. Web setup flushes these after each
// test so an import() cannot still be evaluating when jsdom tears the environment down
// (EnvironmentTeardownError). A source-level ban cannot see which promise outlives the test.
const pendingDynamicImports = new Set<Promise<void>>()

/** Remember a next/dynamic loader promise until flush or until it settles. */
export function trackDynamicImport(promise: Promise<unknown>): void {
  const settled = promise.then(
    () => undefined,
    () => undefined,
  )
  pendingDynamicImports.add(settled)
  void settled.finally(() => {
    pendingDynamicImports.delete(settled)
  })
}

/** Start a dynamic loader and remember its promise, including a synchronous throw. */
export function trackDynamicLoader(loader: () => Promise<unknown>): void {
  trackDynamicImport(Promise.resolve().then(loader))
}

/** Settle every loader promise still in flight. Web unit setup calls this after cleanup. */
export async function flushPendingDynamicImports(): Promise<void> {
  while (pendingDynamicImports.size > 0) {
    const current = [...pendingDynamicImports]
    pendingDynamicImports.clear()
    await Promise.all(current)
  }
}

// Call the loader when dynamic() runs, not on mount. Add-tag tests read the child without
// waiting for an effect, and the promise still has to finish before jsdom teardown.
export function createEagerDynamicMock(): typeof import('next/dynamic') {
  const React = require('react') as typeof import('react')
  return {
    default: (loader: () => Promise<unknown>) => {
      let Component: React.ComponentType<Record<string, unknown>> | null = null
      trackDynamicImport(
        loader().then((mod: unknown) => {
          const resolved = mod as { default?: React.ComponentType<Record<string, unknown>> }
          Component = resolved.default ?? null
          return undefined
        }),
      )
      return function EagerDynamic(props: Record<string, unknown>) {
        if (!Component) return null
        return React.createElement(Component, props)
      }
    },
  } as unknown as typeof import('next/dynamic')
}

// Resolve dynamic imports in jsdom, and let a child mock intercept the loaded component.
// The loader promise is tracked so teardown waits for the module graph, including modules
// the child mock does not replace.
export function createNextDynamicMock(): typeof import('next/dynamic') {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          const pendingLoad = loader().then((mod: unknown) => {
            if (!active) return undefined
            setDynamicComponent(() =>
              typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
            )
            return undefined
          })
          trackDynamicImport(pendingLoad)
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  } as unknown as typeof import('next/dynamic')
}
