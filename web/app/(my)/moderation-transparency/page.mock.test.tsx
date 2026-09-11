import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModerationTransparencyPage, { generateMetadata } from './page'

const { panelMock, rangeFilterMock, getModerationTransparencyOrNullMock, getTranslationsMock } =
  vi.hoisted(() => ({
    panelMock: vi.fn<VitestLooseMock>(() => <div data-testid='moderation-transparency-panel' />),
    rangeFilterMock: vi.fn<VitestLooseMock>(() => (
      <div data-testid='moderation-transparency-range' />
    )),
    getModerationTransparencyOrNullMock: vi.fn<VitestLooseMock>(),
    getTranslationsMock: vi.fn<VitestLooseMock>(),
  }))

vi.mock(import('@/components/moderation/moderation-transparency-panel'), () => ({
  ModerationTransparencyPanel: panelMock,
}))

vi.mock(import('@/components/moderation/moderation-analytics-range-filter'), () => ({
  ModerationAnalyticsRangeFilter: rangeFilterMock,
}))

vi.mock(import('@/lib/api/server/moderation-analytics'), () => ({
  getModerationTransparencyOrNull: getModerationTransparencyOrNullMock,
}))

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: getTranslationsMock,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: (title?: string) => ({ title }),
}))

describe('ModerationTransparencyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTranslationsMock.mockResolvedValue((key: string) =>
      key ===
      'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9'
        ? 'Transparence de la modération'
        : key,
    )
  })

  it('renders paid global aggregate data through the transparency panel', async () => {
    getModerationTransparencyOrNullMock.mockResolvedValue(makeTransparency())

    render(await ModerationTransparencyPage({ searchParams: Promise.resolve({}) }))

    expect(getModerationTransparencyOrNullMock).toHaveBeenCalledWith({ range: '30d' })
    expect(screen.getByTestId('moderation-transparency-panel')).toBeDefined()
    expect(panelMock).toHaveBeenCalledWith(
      expect.objectContaining({ transparency: makeTransparency() }),
      undefined,
    )
  })

  it('passes null to clear paid data after a forbidden response or entitlement downgrade', async () => {
    getModerationTransparencyOrNullMock.mockResolvedValue(null)

    render(await ModerationTransparencyPage({ searchParams: Promise.resolve({}) }))

    expect(panelMock).toHaveBeenCalledWith(
      expect.objectContaining({ transparency: null }),
      undefined,
    )
  })

  it('uses the selected range for both the request and the shared range control', async () => {
    getModerationTransparencyOrNullMock.mockResolvedValue(makeTransparency())

    render(
      await ModerationTransparencyPage({
        searchParams: Promise.resolve({ range: '7d' }),
      }),
    )

    expect(getModerationTransparencyOrNullMock).toHaveBeenCalledWith({ range: '7d' })
    expect(rangeFilterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: '/moderation-transparency',
        range: '7d',
        todayLabelKey:
          'extracted.moderationAnalytics.moderationTransparencyPanel.latestReleasedDay_2a9e5b31',
      }),
      undefined,
    )
  })

  it('localizes no-index metadata', async () => {
    await expect(generateMetadata()).resolves.toEqual({ title: 'Transparence de la modération' })
  })
})

function makeTransparency() {
  return {
    range: '30d' as const,
    buckets: [
      {
        date: '2026-01-01',
        metric: 'reports' as const,
        category: 'spam',
        count: 25,
      },
    ],
  }
}
