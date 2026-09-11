import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Loading from './loading'

const { headerMock, rangeFilterMock, panelMock, getTranslationsMock } = vi.hoisted(() => ({
  headerMock: vi.fn<VitestLooseMock>(() => <div data-testid='settings-page-header' />),
  rangeFilterMock: vi.fn<VitestLooseMock>(() => (
    <div data-testid='moderation-transparency-range' />
  )),
  panelMock: vi.fn<VitestLooseMock>(() => <div data-testid='moderation-transparency-panel' />),
  getTranslationsMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: headerMock,
}))

vi.mock(import('@/components/moderation/moderation-analytics-range-filter'), () => ({
  ModerationAnalyticsRangeFilter: rangeFilterMock,
}))

vi.mock(import('@/components/moderation/moderation-transparency-panel'), () => ({
  ModerationTransparencyPanel: panelMock,
}))

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: getTranslationsMock,
}))

describe('ModerationTransparencyLoading', () => {
  it('mirrors the page wrapper, header, range control, and loading panel', async () => {
    getTranslationsMock.mockResolvedValue((key: string) => key)

    const { container } = render(await Loading())

    expect(container.firstElementChild).toHaveClass('space-y-6')
    expect(screen.getByTestId('settings-page-header')).toBeDefined()
    expect(rangeFilterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: '/moderation-transparency',
        range: '30d',
        todayLabelKey:
          'extracted.moderationAnalytics.moderationTransparencyPanel.latestReleasedDay_2a9e5b31',
      }),
      undefined,
    )
    expect(panelMock).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true, showTitle: false, transparency: undefined }),
      undefined,
    )
  })
})
