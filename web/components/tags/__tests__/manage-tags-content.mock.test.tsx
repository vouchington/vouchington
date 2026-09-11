import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('../add-tag-form'), () => ({
  AddTagForm: () => <div>Lazy tag form</div>,
}))
vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: () => ({
    pages: [],
    hasNextPage: false,
    endCursor: null,
    loadMore: vi.fn<() => Promise<void>>(),
    loadingMore: false,
    fetchError: null,
    clearError: vi.fn<() => void>(),
    resetKey: Symbol('pagination-reset'),
  }),
}))
vi.mock(import('@/lib/api/merge-entity-relations'), () => ({
  mergeEntityRelationPages: () => ({
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    entity_relations: {},
    election_votes: {},
  }),
}))

import { ManageTagsContent } from '../manage-tags-content'

describe('ManageTagsContent', () => {
  it('does not load its lazy tag form for unauthenticated users', async () => {
    const relationsPromise = Promise.resolve({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      entity_relations: {},
      election_votes: {},
    })

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading</div>}>
          <ManageTagsContent
            entityType='topic'
            entityId='topic-1'
            predicate='category'
            objectType='topic'
            label='Categories'
            relationsPromise={relationsPromise}
            isAuthenticated={false}
          />
        </Suspense>,
      )
      await relationsPromise
    })

    expect(
      await screen.findByText('extracted.tags.manageTagsContent.currentLabelTags_77192984'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Lazy tag form')).not.toBeInTheDocument()
  })

  it('loads its lazy tag form for authenticated users', async () => {
    const relationsPromise = Promise.resolve({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      entity_relations: {},
      election_votes: {},
    })

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading</div>}>
          <ManageTagsContent
            entityType='topic'
            entityId='topic-1'
            predicate='category'
            objectType='topic'
            label='Categories'
            relationsPromise={relationsPromise}
            isAuthenticated
          />
        </Suspense>,
      )
      await relationsPromise
    })

    expect(await screen.findByText('Lazy tag form')).toBeInTheDocument()
  })
})
