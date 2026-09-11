import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: ReactNode }) => children,
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children }: { children: ReactNode }) => children,
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

import { ReportsClient } from './reports-client'

describe('ReportsClient pagination links', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setPathname('/reports')
  })

  it.each([
    { clusterMode: 'none' as const, response: flatResponse(true), expectedCluster: 'none' },
    {
      clusterMode: 'entity' as const,
      response: clusteredResponse(true),
      expectedCluster: 'entity',
    },
  ])('preserves $expectedCluster mode and filters in both directions', testCase => {
    render(
      <ReportsClient
        viewerTier='staff'
        data={testCase.response}
        statusFilter='reviewed'
        sortOrder='created_at_asc'
        clusterMode={testCase.clusterMode}
        currentAfter='previous-cursor'
      />,
    )

    expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
      'href',
      `/reports?status=reviewed&sort=created_at_asc&cluster=${testCase.expectedCluster}&before=start-cursor`,
    )
    expect(screen.getByRole('link', { name: /next page/i })).toHaveAttribute(
      'href',
      `/reports?status=reviewed&sort=created_at_asc&cluster=${testCase.expectedCluster}&after=next-cursor`,
    )
  })

  it.each([flatResponse(false), clusteredResponse(false)])(
    'hides Next on a terminal page even when end_cursor is present',
    response => {
      render(
        <ReportsClient
          viewerTier='staff'
          data={response}
        />,
      )

      expect(screen.queryByRole('link', { name: /next page/i })).not.toBeInTheDocument()
    },
  )
})

function flatResponse(hasNextPage: boolean) {
  return {
    results: [],
    page_info: {
      has_next_page: hasNextPage,
      has_previous_page: true,
      start_cursor: 'start-cursor',
      end_cursor: 'next-cursor',
    },
  }
}

function clusteredResponse(hasNextPage: boolean) {
  return {
    cluster_mode: 'entity' as const,
    results: [],
    duplicate_clusters: [],
    page_info: {
      has_next_page: hasNextPage,
      has_previous_page: true,
      start_cursor: 'start-cursor',
      end_cursor: 'next-cursor',
    },
  }
}
