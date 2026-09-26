import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  makeCuratedAsideItem,
  mockCreate,
  mockList,
  mockReorder,
  resetCuratedAsideMocks,
  toastMock,
} from '@/test-helpers/app/curated-asides/page.mock-support'

import CuratedAsidesPage from '../curated-asides-client'

describe('CuratedAsidesPage', () => {
  beforeEach(() => {
    resetCuratedAsideMocks()
  })

  it('adds a selected autocomplete entity without sending position', async () => {
    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getByRole('button', { name: 'Select topic' }))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        aside_type: 'topic',
        entity_id: 'topic-selected',
      })
    })
    expect(screen.getByText('Selected topic')).toBeInTheDocument()
  })

  it('replaces an existing item after create returns an upserted curated aside', async () => {
    const existingItem = makeCuratedAsideItem({
      id: 'item-1',
      entity_id: 'topic-entity',
      position: 2,
    })
    const leadingItem = makeCuratedAsideItem({
      id: 'item-2',
      entity_id: 'topic-entity-2',
      position: 0,
      entity_data: {
        entity_type: 'topic',
        id: 'topic-entity-2',
        name: 'Transfer Bonuses',
        slug: 'transfer-bonuses',
        topic_type: 'topic',
      },
    })
    mockList.mockResolvedValue({ curated_aside_items: [existingItem, leadingItem] })
    mockCreate.mockResolvedValue({
      curated_aside_item: makeCuratedAsideItem({
        id: 'item-1',
        entity_id: 'topic-entity',
        position: 1,
      }),
    })

    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getByRole('button', { name: 'Select topic' }))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })

    const rows = await screen.findAllByRole('row')
    expect(rows.slice(1)).toHaveLength(2)
    expect(within(rows[1]!).getByText('Transfer Bonuses')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Premium Travel Cards')).toBeInTheDocument()
  })

  it('shows error toast when reorder fails and restores original order', async () => {
    const items = [
      makeCuratedAsideItem({ id: 'item-1', position: 0 }),
      makeCuratedAsideItem({
        id: 'item-2',
        entity_id: 'topic-entity-2',
        position: 1,
        entity_data: {
          entity_type: 'topic',
          id: 'topic-entity-2',
          name: 'Transfer Bonuses',
          slug: 'transfer-bonuses',
          topic_type: 'topic',
        },
      }),
    ]
    mockList.mockResolvedValue({ curated_aside_items: items })
    mockReorder.mockRejectedValueOnce(new Error('Reorder failed'))

    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to reorder curated items')
    })

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Premium Travel Cards')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Transfer Bonuses')).toBeInTheDocument()
  })
})
