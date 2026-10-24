import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LandingPageAnalyticsDashboard } from '@/components/my/landing-page-analytics-dashboard'
import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import { StoryFrame } from '@/storybook/story-frame'
import type { LandingPageAnalytics } from '@/types/landing-pages'

const meta = {
  title: 'My/Landing Page Analytics Dashboard',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const items = landingPageWithItems.items

const analytics: LandingPageAnalytics = {
  total_visits: 1280,
  total_clicks: 342,
  ctr: 0.267,
  unique_visitors: 910,
  item_clicks: [
    ...items.slice(0, 3).map((item, index) => ({
      item_id: item.id,
      item_type: item.type,
      click_count: 120 - index * 35,
    })),
    { item_id: 'deleted-item-0000', item_type: 'link', click_count: 4 },
  ],
  daily_stats: [
    { date: '2026-10-19', visits: 120, clicks: 30, unique_visitors: 90 },
    { date: '2026-10-20', visits: 180, clicks: 52, unique_visitors: 130 },
    { date: '2026-10-21', visits: 150, clicks: 41, unique_visitors: 110 },
    { date: '2026-10-22', visits: 240, clicks: 70, unique_visitors: 170 },
  ],
  utm_sources: [
    { utm_source: 'newsletter', visits: 420 },
    { utm_source: 'bluesky', visits: 310 },
    { utm_source: 'reddit', visits: 95 },
  ],
  conversion_funnel: {
    total_visits: 1280,
    total_clicks: 342,
    total_signups: 27,
    visit_to_click_rate: 0.267,
  },
}

export const WithTraffic: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <LandingPageAnalyticsDashboard
        analytics={analytics}
        items={items}
      />
    </StoryFrame>
  ),
}

export const NoTrafficYet: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <LandingPageAnalyticsDashboard
        analytics={{
          total_visits: 0,
          total_clicks: 0,
          ctr: 0,
          unique_visitors: 0,
          item_clicks: [],
          daily_stats: [],
          utm_sources: [],
          conversion_funnel: {
            total_visits: 0,
            total_clicks: 0,
            total_signups: 0,
            visit_to_click_rate: 0,
          },
        }}
        items={items}
      />
    </StoryFrame>
  ),
}
