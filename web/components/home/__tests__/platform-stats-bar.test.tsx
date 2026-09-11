import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlatformStatsBar } from '../platform-stats-bar'
import type { PlatformStatsViewModel } from '@/lib/view-models/homepage-view-models'

function makeStats(overrides: Partial<PlatformStatsViewModel> = {}): PlatformStatsViewModel {
  return {
    topic_count: 24,
    review_count: 12,
    data_point_count: 1250,
    hostname_count: 9,
    ...overrides,
  }
}

describe('PlatformStatsBar', () => {
  it('renders nothing without platform stats data', () => {
    const { container } = render(<PlatformStatsBar data={null} />)

    expect(container.firstChild).toBeNull()
  })

  it('hides stats below the visibility threshold', () => {
    render(
      <PlatformStatsBar
        data={makeStats({
          data_point_count: 4,
          hostname_count: 0,
          review_count: 3,
          topic_count: 5,
        })}
      />,
    )

    expect(screen.getByText('5')).toBeDefined()
    expect(screen.getByText('Topics')).toBeDefined()
    expect(screen.queryByText('Data Points')).toBeNull()
    expect(screen.queryByText('Trusted Domains')).toBeNull()
    expect(screen.queryByText('Reviews')).toBeNull()
  })

  it('renders nothing when every stat is below the visibility threshold', () => {
    const { container } = render(
      <PlatformStatsBar
        data={makeStats({
          topic_count: 0,
          review_count: 0,
          data_point_count: 0,
          hostname_count: 0,
        })}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders visible stats with compact number formatting', () => {
    render(<PlatformStatsBar data={makeStats()} />)

    expect(screen.getByText('1.3K')).toBeDefined()
    expect(screen.getByText('Data Points')).toBeDefined()
    expect(screen.getByText('24')).toBeDefined()
    expect(screen.getByText('Topics')).toBeDefined()
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('Reviews')).toBeDefined()
    expect(screen.getByText('9')).toBeDefined()
    expect(screen.getByText('Trusted Domains')).toBeDefined()
  })
})
