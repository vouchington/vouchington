import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Sidebar,
  SidebarMenuAction,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const mediaListeners = new Set<(event: MediaQueryListEvent) => void>()

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn<(query: string) => MediaQueryList>().mockImplementation((query: string) => {
      const mediaQueryList = {
        matches,
        media: query,
        onchange: null,
        addEventListener: (_event: 'change', listener: (event: MediaQueryListEvent) => void) => {
          mediaListeners.add(listener)
        },
        removeEventListener: (_event: 'change', listener: (event: MediaQueryListEvent) => void) => {
          mediaListeners.delete(listener)
        },
        addListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
        dispatchEvent: vi.fn<() => boolean>(),
      }
      return mediaQueryList as unknown as MediaQueryList
    }),
  })
}

describe('Sidebar shell', () => {
  beforeEach(() => {
    mediaListeners.clear()
    setMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts the sidebar child tree once when the mobile sheet is open', async () => {
    setMatchMedia(true)

    render(
      <SidebarProvider>
        <SidebarTrigger />
        <Sidebar>
          <div>Sidebar item</div>
        </Sidebar>
      </SidebarProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByText('Sidebar item')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))

    await waitFor(() => {
      expect(screen.getAllByText('Sidebar item')).toHaveLength(1)
    })
  })

  it('keeps menu actions at the minimum accessible target size', () => {
    render(<SidebarMenuAction aria-label='Example action' />)

    expect(screen.getByRole('button', { name: 'Example action' })).toHaveClass(
      'w-6',
      'aspect-square',
    )
  })
})
