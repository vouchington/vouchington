import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AuthorizedUserSelect } from './authorized-user-select'
import type { IndividualCard } from '@/types/my'
import type { CardEditForm } from './types'

const card: IndividualCard = {
  id: 'child',
  card_id: 'topic-child',
  opened_on: null,
  closed_on: null,
  received_sign_up_bonus_on: null,
  credit_limit: null,
  is_authorized_user: true,
  authorized_user_of_id: 'parent',
  note: null,
  card: { id: 'topic-child', name: 'Child card', slug: 'child-card' },
  authorized_user_of_card: {
    id: 'parent',
    opened_on: null,
    closed_on: null,
    card: { id: 'topic-parent', name: 'Parent card', slug: 'parent-card' },
  },
}

const initialForm: CardEditForm = {
  opened_on: '',
  closed_on: '',
  received_sign_up_bonus_on: '',
  credit_limit: '',
  currency: 'usd',
  is_authorized_user: true,
  authorized_user_of_id: 'parent',
  note: '',
}

function Harness({ error, onLoadMore }: { error: Error | null; onLoadMore: () => void }) {
  const [editForm, setEditForm] = useState(initialForm)
  return (
    <>
      <span data-testid='selected-parent'>{editForm.authorized_user_of_id}</span>
      <AuthorizedUserSelect
        card={card}
        cards={[card]}
        editForm={editForm}
        setEditForm={setEditForm}
        loadingMore={false}
        canLoadMore
        loadMoreError={error}
        onLoadMore={onLoadMore}
      />
    </>
  )
}

describe('AuthorizedUserSelect pagination', () => {
  it('loads more parent choices without changing the current selection', () => {
    const onLoadMore = vi.fn<() => void>()
    render(
      <Harness
        error={null}
        onLoadMore={onLoadMore}
      />,
    )

    fireEvent.click(screen.getByText('Load more'))

    expect(onLoadMore).toHaveBeenCalledOnce()
    expect(screen.getByTestId('selected-parent')).toHaveTextContent('parent')
  })

  it('offers retry after a continuation error', () => {
    const onLoadMore = vi.fn<() => void>()
    render(
      <Harness
        error={new Error('offline')}
        onLoadMore={onLoadMore}
      />,
    )

    fireEvent.click(screen.getByText('Retry'))

    expect(onLoadMore).toHaveBeenCalledOnce()
  })
})
