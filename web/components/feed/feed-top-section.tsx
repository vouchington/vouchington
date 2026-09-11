import type { ReactNode } from 'react'
// Absolute import (not sibling-relative) so Storybook's Vite alias can stub this async
// Server Component (see web/storybook/mocks/feed-page-header.tsx).
import { FeedPageHeader } from '@/components/feed/feed-page-header'
import { FeedSubFilterDropdown } from './feed-sub-filter-dropdown'
import type { FeedCategory } from '@/lib/feed-route-configs'

export function FeedTopSection({
  category,
  activeFilterPath,
  filters,
  viewToggle,
  action,
}: {
  category: FeedCategory
  activeFilterPath: string
  filters: ReactNode
  viewToggle: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      className='space-y-4'
      data-pw='feed-top-section'
    >
      {action ? (
        <div className='flex flex-wrap items-start justify-between'>
          <FeedPageHeader
            category={category}
            activeFilterPath={activeFilterPath}
          />
          {action}
        </div>
      ) : (
        <FeedPageHeader
          category={category}
          activeFilterPath={activeFilterPath}
        />
      )}
      <div className='flex flex-wrap items-start justify-between gap-2 sm:items-center'>
        <div className='flex flex-1 flex-wrap items-center gap-2'>
          <FeedSubFilterDropdown
            category={category}
            activeFilterPath={activeFilterPath}
          />
          {filters}
        </div>
        {viewToggle}
      </div>
    </div>
  )
}
