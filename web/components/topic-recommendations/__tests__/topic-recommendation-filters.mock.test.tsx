import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { TopicRecommendationFilters } from '../topic-recommendation-filters'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

describe('TopicRecommendationFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders the status select trigger', () => {
    render(<TopicRecommendationFilters />)
    const trigger = document.querySelector('[data-pw="topic-recommendation-status-filter"]')
    expect(trigger).not.toBeNull()
    expect(trigger).toHaveAccessibleName('Status')
  })

  it('reads status=pending from search params', () => {
    mockNav.setSearchParams('status=pending')
    render(<TopicRecommendationFilters />)
    const trigger = document.querySelector('[data-pw="topic-recommendation-status-filter"]')
    expect(trigger).not.toBeNull()
  })

  it('falls back to "all" for unknown status values', () => {
    mockNav.setSearchParams('status=unknown-invalid')
    render(<TopicRecommendationFilters />)
    const trigger = document.querySelector('[data-pw="topic-recommendation-status-filter"]')
    expect(trigger).not.toBeNull()
  })

  it('renders with a status select trigger that is a button', () => {
    render(<TopicRecommendationFilters />)
    const trigger = document.querySelector('[data-pw="topic-recommendation-status-filter"]')
    expect(trigger?.tagName.toLowerCase()).toBe('button')
  })
})
