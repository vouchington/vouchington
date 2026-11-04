'use client'

import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import type { CopyrightTerritorialPoster } from '@/types/copyright-territorial'

type Props = {
  posters: readonly CopyrightTerritorialPoster[]
  fetchError: Error | null
  hasNextPage: boolean
  loadingMore: boolean
  clearError: () => void
  loadMore: () => void
}

/** One row per target and poster, so a poster on several targets appears once for each. */
export function CopyrightStaffTerritorialPosters({ posters, ...footer }: Props) {
  return (
    <section
      aria-label='Poster delivery status'
      className='space-y-1'
    >
      <h4 className='font-medium'>Poster notice delivery</h4>
      {posters.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No poster delivery is recorded.</p>
      ) : (
        <ul className='space-y-1 text-sm'>
          {posters.map((poster, index) => (
            <li key={`${poster.target_id}:${poster.user_id ?? 'guest'}`}>
              Poster {index + 1}: {poster.state ?? 'not sent'}; informed{' '}
              {poster.informed_at ? new Date(poster.informed_at).toLocaleString() : 'Not recorded'}.
            </li>
          ))}
        </ul>
      )}
      <PaginatedListFooter
        fetchError={footer.fetchError}
        canLoadMore={footer.hasNextPage}
        loadingMore={footer.loadingMore}
        clearError={footer.clearError}
        loadMore={footer.loadMore}
      />
    </section>
  )
}
