import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  makeCuratedAsideItem,
  mockDelete,
  mockList,
  mockReorder,
  resetCuratedAsideMocks,
  toastMock,
} from '@/test-helpers/app/curated-asides/page.mock-support'

import CuratedAsidesPage from '../curated-asides-client'
import CuratedAsideTopicsRoutePage from '../topics/page'

describe('CuratedAsidesPage', () => {
  beforeEach(() => {
    resetCuratedAsideMocks()
  })

  it('renders through the topics route page wrapper', async () => {
    render(<CuratedAsideTopicsRoutePage />)
    expect(screen.getByText('Curated Asides')).toBeInTheDocument()
    expect(await screen.findByText('Premium Travel Cards')).toBeInTheDocument()
  })

  it('shows loading state initially and disables inline add controls', () => {
    mockList.mockReturnValue(new Promise(() => undefined))
    render(<CuratedAsidesPage activeAsideType='topic' />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select topic' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add Item' })).not.toBeInTheDocument()
  })

  it('renders entity labels without position or UUID columns', async () => {
    render(<CuratedAsidesPage activeAsideType='topic' />)
    expect(await screen.findByText('Premium Travel Cards')).toBeInTheDocument()
    expect(screen.getByText('premium-travel-cards')).toBeInTheDocument()
    expect(screen.queryByText('Position')).not.toBeInTheDocument()
    expect(screen.queryByText('Entity UUID')).not.toBeInTheDocument()
    expect(screen.queryByText('topic-entity')).not.toBeInTheDocument()
  })

  it('deletes an item and removes it from the list', async () => {
    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('item-1')
    })
    expect(screen.queryByText('Premium Travel Cards')).not.toBeInTheDocument()
  })

  it('shows error toast when delete fails', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))
    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to delete curated item')
    })
  })

  it('reorders items when move up is clicked', async () => {
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

    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!)

    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalledWith('topic', ['item-2', 'item-1'])
    })

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Transfer Bonuses')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Premium Travel Cards')).toBeInTheDocument()
  })
})
