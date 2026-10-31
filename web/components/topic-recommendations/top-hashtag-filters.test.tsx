import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TopHashtagMapping } from '@/lib/api/client/topic-recommendations'
import { TopHashtagFilters } from './top-hashtag-filters'

describe('TopHashtagFilters', () => {
  it('searches with the mapping selected by each filter', () => {
    const onSearch = vi.fn<(mapping?: TopHashtagMapping) => void>()

    render(
      <TopHashtagFilters
        query='travel'
        mapping='all'
        onQueryChange={vi.fn<(query: string) => void>()}
        onSearch={onSearch}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Linked' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unlinked' }))

    expect(onSearch).toHaveBeenNthCalledWith(1, 'all')
    expect(onSearch).toHaveBeenNthCalledWith(2, 'linked')
    expect(onSearch).toHaveBeenNthCalledWith(3, 'unlinked')
    expect(onSearch).toHaveBeenCalledTimes(3)
  })
})
