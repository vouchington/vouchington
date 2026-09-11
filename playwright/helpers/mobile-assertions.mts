import { expect, type Page } from '@playwright/test'

export interface HorizontalOverflowState {
  overflow: boolean
  scrollWidth: number
  clientWidth: number
  offenders: Array<{ tag: string; id: string; cls: string; right: number }>
}

export function getHorizontalOverflowState(): HorizontalOverflowState {
  const scrollWidth = document.documentElement.scrollWidth
  const clientWidth = document.documentElement.clientWidth
  if (scrollWidth <= clientWidth) {
    return { overflow: false, scrollWidth, clientWidth, offenders: [] }
  }

  const offenders: HorizontalOverflowState['offenders'] = []
  for (const element of document.querySelectorAll('*')) {
    const rect = element.getBoundingClientRect()
    if (rect.right > clientWidth + 1) {
      offenders.push({
        tag: element.tagName,
        id: element.id,
        cls: (element as HTMLElement).className?.toString().slice(0, 60),
        right: Math.round(rect.right),
      })
    }
  }
  return { overflow: true, scrollWidth, clientWidth, offenders: offenders.slice(0, 10) }
}

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  // Poll until layout settles — CSS transitions like
  // sidebar collapse may briefly cause scrollWidth > clientWidth.
  const state: { lastResult: HorizontalOverflowState | null } = { lastResult: null }

  try {
    await expect
      .poll(
        async () => {
          state.lastResult = await page.evaluate(getHorizontalOverflowState)
          return state.lastResult.overflow
        },
        { timeout: 5000, intervals: [50, 100] },
      )
      .toBe(false)
  } catch (error) {
    // Log only once after all retries are exhausted
    const { lastResult } = state
    if (lastResult?.overflow) {
      console.error(
        `Horizontal overflow detected: scrollWidth=${lastResult.scrollWidth} clientWidth=${lastResult.clientWidth}\nOffending elements:`,
        JSON.stringify(lastResult.offenders, null, 2),
      )
    }
    throw error
  }
}
