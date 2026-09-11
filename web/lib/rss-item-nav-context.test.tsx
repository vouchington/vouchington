import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useRssItemNav } from './rss-item-nav-context'
import { RssItemNavProvider } from './rss-item-nav-provider'

function NavConsumer({ currentId }: { currentId: string }) {
  const ctx = useRssItemNav()
  if (!ctx) return <div data-testid='no-context' />
  const ids = ctx.orderedItemIds
  const idx = ids.indexOf(currentId)
  const previousId = idx > 0 ? ids[idx - 1] : null
  const nextId = idx !== -1 && idx < ids.length - 1 ? ids[idx + 1] : null
  return (
    <div>
      <span data-testid='previous'>{previousId ?? 'none'}</span>
      <span data-testid='next'>{nextId ?? 'none'}</span>
      <span data-testid='ids'>{ids.join(',')}</span>
    </div>
  )
}

describe('RssItemNavContext', () => {
  const IDS = ['id-a', 'id-b', 'id-c']

  it('provides ordered IDs to consumers', () => {
    render(
      <RssItemNavProvider orderedItemIds={IDS}>
        <NavConsumer currentId='id-b' />
      </RssItemNavProvider>,
    )

    expect(screen.getByTestId('ids').textContent).toBe('id-a,id-b,id-c')
  })

  it('returns the correct previous and next IDs for a middle item', () => {
    render(
      <RssItemNavProvider orderedItemIds={IDS}>
        <NavConsumer currentId='id-b' />
      </RssItemNavProvider>,
    )

    expect(screen.getByTestId('previous').textContent).toBe('id-a')
    expect(screen.getByTestId('next').textContent).toBe('id-c')
  })

  it('returns null previous for the first item', () => {
    render(
      <RssItemNavProvider orderedItemIds={IDS}>
        <NavConsumer currentId='id-a' />
      </RssItemNavProvider>,
    )

    expect(screen.getByTestId('previous').textContent).toBe('none')
    expect(screen.getByTestId('next').textContent).toBe('id-b')
  })

  it('returns null next for the last item', () => {
    render(
      <RssItemNavProvider orderedItemIds={IDS}>
        <NavConsumer currentId='id-c' />
      </RssItemNavProvider>,
    )

    expect(screen.getByTestId('previous').textContent).toBe('id-b')
    expect(screen.getByTestId('next').textContent).toBe('none')
  })

  it('returns null for an unknown item ID', () => {
    render(
      <RssItemNavProvider orderedItemIds={IDS}>
        <NavConsumer currentId='id-unknown' />
      </RssItemNavProvider>,
    )

    // idx === -1, so both are null
    expect(screen.getByTestId('previous').textContent).toBe('none')
    expect(screen.getByTestId('next').textContent).toBe('none')
  })

  it('returns null context when no provider is present', () => {
    render(<NavConsumer currentId='id-a' />)

    expect(screen.getByTestId('no-context')).toBeDefined()
  })
})
