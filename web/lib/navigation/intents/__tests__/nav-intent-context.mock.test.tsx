import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'

let mockPathname = '/news'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

import { useResolvedIntent } from '../nav-intent-context'
import { NavIntentProvider, SetNavIntent } from '../nav-intent-provider'
import type { NavIntentId } from '../types'

function IntentConsumer({
  pathname,
  onRender,
}: {
  pathname: string
  onRender: (v: NavIntentId | null) => void
}) {
  const intent = useResolvedIntent(pathname)
  onRender(intent)
  return null
}

describe('useResolvedIntent', () => {
  beforeEach(() => {
    mockPathname = '/news'
  })

  it('falls back to getActiveIntent when no provider is present', () => {
    let captured: NavIntentId | null | undefined = undefined
    render(
      <IntentConsumer
        pathname='/news'
        onRender={v => (captured = v)}
      />,
    )
    expect(captured).toBe('news')
  })

  it('falls back to getActiveIntent for /source/foo (baseline web-search) when no override', () => {
    let captured: NavIntentId | null | undefined = undefined
    render(
      <NavIntentProvider>
        <IntentConsumer
          pathname='/source/foo'
          onRender={v => (captured = v)}
        />
      </NavIntentProvider>,
    )
    expect(captured).toBe('web-search')
  })

  it('returns messages intent for /messages', () => {
    let captured: NavIntentId | null | undefined = undefined
    render(
      <NavIntentProvider>
        <IntentConsumer
          pathname='/messages'
          onRender={v => (captured = v)}
        />
      </NavIntentProvider>,
    )
    expect(captured).toBe('messages')
  })

  it('uses override when SetNavIntent registers matching pathname', async () => {
    mockPathname = '/source/level1techs'
    let captured: NavIntentId | null | undefined = undefined
    render(
      <NavIntentProvider>
        <SetNavIntent intent='videos' />
        <IntentConsumer
          pathname='/source/level1techs'
          onRender={v => (captured = v)}
        />
      </NavIntentProvider>,
    )
    // Wait for effect to flush
    await act(async () => {})
    expect(captured).toBe('videos')
  })

  it('falls back to getActiveIntent when override is for a different pathname', async () => {
    mockPathname = '/source/other-source'
    let captured: NavIntentId | null | undefined = undefined
    render(
      <NavIntentProvider>
        <SetNavIntent intent='videos' />
        <IntentConsumer
          pathname='/source/different-source'
          onRender={v => (captured = v)}
        />
      </NavIntentProvider>,
    )
    await act(async () => {})
    // The override is for '/source/other-source', not '/source/different-source'
    expect(captured).toBe('web-search')
  })

  it('matches sub-paths when override is registered on canonical base path', async () => {
    mockPathname = '/source/level1techs/latest'
    let captured: NavIntentId | null | undefined = undefined
    render(
      <NavIntentProvider>
        <SetNavIntent
          intent='videos'
          pathname='/source/level1techs'
        />
        <IntentConsumer
          pathname='/source/level1techs/latest'
          onRender={v => (captured = v)}
        />
      </NavIntentProvider>,
    )
    await act(async () => {})
    expect(captured).toBe('videos')
  })

  it('matches multiple sub-paths under same canonical base path override', async () => {
    mockPathname = '/source/level1techs/about'
    const results: (NavIntentId | null)[] = []
    render(
      <NavIntentProvider>
        <SetNavIntent
          intent='videos'
          pathname='/source/level1techs'
        />
        <IntentConsumer
          pathname='/source/level1techs/about'
          onRender={v => results.push(v)}
        />
        <IntentConsumer
          pathname='/source/level1techs/news'
          onRender={v => results.push(v)}
        />
      </NavIntentProvider>,
    )
    await act(async () => {})
    // Both sub-tabs should resolve to the canonical override
    expect(results.at(-2)).toBe('videos')
    expect(results.at(-1)).toBe('videos')
  })

  it('does not match unrelated paths that start with the same prefix', async () => {
    mockPathname = '/source/level1techs'
    let captured: NavIntentId | null | undefined = undefined
    render(
      <NavIntentProvider>
        <SetNavIntent
          intent='videos'
          pathname='/source/level1techs'
        />
        <IntentConsumer
          pathname='/source/level1techs-extended'
          onRender={v => (captured = v)}
        />
      </NavIntentProvider>,
    )
    await act(async () => {})
    // '/source/level1techs-extended' does not start with '/source/level1techs/'
    expect(captured).toBe('web-search')
  })
})

describe('SetNavIntent', () => {
  beforeEach(() => {
    mockPathname = '/source/level1techs'
  })

  it('registers intent with NavIntentProvider on mount', async () => {
    let captured: NavIntentId | null | undefined = undefined
    render(
      <NavIntentProvider>
        <SetNavIntent intent='videos' />
        <IntentConsumer
          pathname='/source/level1techs'
          onRender={v => (captured = v)}
        />
      </NavIntentProvider>,
    )
    await act(async () => {})
    expect(captured).toBe('videos')
  })

  it('registers on explicit pathname prop, not currentPathname', async () => {
    mockPathname = '/source/level1techs/latest'
    let captured: NavIntentId | null | undefined = undefined
    render(
      <NavIntentProvider>
        <SetNavIntent
          intent='videos'
          pathname='/source/level1techs'
        />
        <IntentConsumer
          pathname='/source/level1techs'
          onRender={v => (captured = v)}
        />
      </NavIntentProvider>,
    )
    await act(async () => {})
    expect(captured).toBe('videos')
  })

  it('renders nothing in the DOM', () => {
    const { container } = render(
      <NavIntentProvider>
        <SetNavIntent intent='podcasts' />
      </NavIntentProvider>,
    )
    // SetNavIntent renders null — the container has no visible DOM nodes
    expect(container.querySelector('[data-testid]')).toBeNull()
  })
})
