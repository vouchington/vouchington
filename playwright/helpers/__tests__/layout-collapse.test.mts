import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { ensureSidebarOpen } from '../layout-collapse.mts'

interface FakeLocator {
  _apiName: 'Locator'
  _expect: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<unknown>>>
  click: ReturnType<typeof vi.fn<() => Promise<void>>>
  getAttribute: ReturnType<typeof vi.fn<(name: string) => Promise<string | null>>>
}

function createFakeLocator(dataState: string) {
  const attributeAssertions = vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
    matches: true,
    received: dataState,
    log: [],
    timedOut: false,
  })

  return {
    attributeAssertions,
    locator: {
      _apiName: 'Locator',
      _expect: attributeAssertions,
      click: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getAttribute: vi.fn<(name: string) => Promise<string | null>>().mockResolvedValue(dataState),
    } satisfies FakeLocator,
  }
}

function createMockPage(dataState: string) {
  const sidebarPeer = createFakeLocator(dataState)
  const sidebarTrigger = createFakeLocator(dataState)
  const getByTestId = vi
    .fn<(dataPw: string) => FakeLocator>()
    .mockImplementation(dataPw =>
      dataPw === 'sidebar-peer' ? sidebarPeer.locator : sidebarTrigger.locator,
    )

  return { page: { getByTestId } as unknown as Page, sidebarPeer, sidebarTrigger, getByTestId }
}

describe('ensureSidebarOpen', () => {
  it('clicks the canonical trigger only when the sidebar is collapsed', async () => {
    const { page, sidebarPeer, sidebarTrigger, getByTestId } = createMockPage('collapsed')

    const result = await ensureSidebarOpen(page)

    expect(result).toBe(sidebarPeer.locator)
    expect(getByTestId).toHaveBeenCalledWith('sidebar-peer')
    expect(getByTestId).toHaveBeenCalledWith('sidebar-trigger')
    expect(sidebarTrigger.locator.click).toHaveBeenCalledOnce()
    expect(sidebarPeer.attributeAssertions).toHaveBeenCalledOnce()
  })

  it('does not click the trigger when the sidebar is already expanded', async () => {
    const { page, sidebarPeer, sidebarTrigger } = createMockPage('expanded')

    await ensureSidebarOpen(page)

    expect(sidebarTrigger.locator.click).not.toHaveBeenCalled()
    expect(sidebarPeer.attributeAssertions).toHaveBeenCalledOnce()
  })
})
