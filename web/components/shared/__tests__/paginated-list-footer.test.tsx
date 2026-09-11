import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PaginatedListFooter } from '../paginated-list-footer'

describe('PaginatedListFooter', () => {
  it('shows a visible Load more control while continuation is available', () => {
    render(
      <PaginatedListFooter
        fetchError={null}
        canLoadMore
        loadingMore={false}
        clearError={vi.fn<VitestLooseMock>()}
        loadMore={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
  })

  it('shows a disabled loading control while continuation is in flight', () => {
    render(
      <PaginatedListFooter
        fetchError={null}
        canLoadMore
        loadingMore
        clearError={vi.fn<VitestLooseMock>()}
        loadMore={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
  })

  it('renders nothing on a terminal page without an error', () => {
    const { container } = render(
      <PaginatedListFooter
        fetchError={null}
        canLoadMore={false}
        loadingMore={false}
        clearError={vi.fn<VitestLooseMock>()}
        loadMore={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when canLoadMore is false', () => {
    const { container } = render(
      <PaginatedListFooter
        fetchError={new Error('fetch failed')}
        canLoadMore={false}
        loadingMore={false}
        clearError={vi.fn<VitestLooseMock>()}
        loadMore={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders retry UI when fetchError and canLoadMore are both set', () => {
    render(
      <PaginatedListFooter
        fetchError={new Error('fetch failed')}
        canLoadMore
        loadingMore={false}
        clearError={vi.fn<VitestLooseMock>()}
        loadMore={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByText('Failed to load more')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('renders nothing in retry-only mode until a continuation fails', () => {
    const { container } = render(
      <PaginatedListFooter
        mode='retry-only'
        fetchError={null}
        canLoadMore
        loadingMore={false}
        clearError={vi.fn<VitestLooseMock>()}
        loadMore={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an announced retry in retry-only mode after a continuation fails', () => {
    render(
      <PaginatedListFooter
        mode='retry-only'
        fetchError={new Error('fetch failed')}
        canLoadMore
        loadingMore={false}
        clearError={vi.fn<VitestLooseMock>()}
        loadMore={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load more')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('marks the retry error for browser tests', () => {
    const { container } = render(
      <PaginatedListFooter
        fetchError={new Error('fetch failed')}
        canLoadMore
        loadingMore={false}
        clearError={vi.fn<VitestLooseMock>()}
        loadMore={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(container.querySelector('[data-pw="paginated-list-retry"]')).toBeVisible()
  })

  it('calls clearError and loadMore when Retry is clicked', () => {
    const clearError = vi.fn<VitestLooseMock>()
    const loadMore = vi.fn<VitestLooseMock>()
    render(
      <PaginatedListFooter
        fetchError={new Error('fetch failed')}
        canLoadMore
        loadingMore={false}
        clearError={clearError}
        loadMore={loadMore}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(clearError).toHaveBeenCalledOnce()
    expect(loadMore).toHaveBeenCalledOnce()
  })
})
