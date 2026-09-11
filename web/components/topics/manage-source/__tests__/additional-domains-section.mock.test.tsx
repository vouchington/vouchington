import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdditionalDomains } from '../additional-domains-section'

type InfiniteScrollProps = Parameters<
  typeof import('@/components/shared/infinite-scroll').InfiniteScroll
>[0]
type RecordedInfiniteScrollProps = Omit<InfiniteScrollProps, 'children'>

const { mockInfiniteScrollProps } = vi.hoisted(() => ({
  mockInfiniteScrollProps: vi.fn<(props: RecordedInfiniteScrollProps) => void>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children, ...props }: InfiniteScrollProps) => {
    mockInfiniteScrollProps(props)
    return <div>{children}</div>
  },
}))

const baseProps = {
  additionalHostnames: [
    {
      hostname_id: 'h-1',
      hostname: 'first.example.com',
      topic_id: 't-1',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  addingHostname: false,
  onAddHostname: vi.fn<VitestLooseMock>(),
  onRemoveHostname: vi.fn<VitestLooseMock>(),
  removingHostnameId: null,
  loadingMore: false,
  fetchError: null,
  clearError: vi.fn<VitestLooseMock>(),
  onLoadMore: vi.fn<VitestLooseMock>(),
}

describe('AdditionalDomains — pagination', () => {
  it('forwards continuation state to InfiniteScroll', () => {
    render(
      <AdditionalDomains
        {...baseProps}
        hasNextPage
        endCursor='hostname-cursor'
      />,
    )

    expect(mockInfiniteScrollProps).toHaveBeenCalledWith(
      expect.objectContaining({
        hasNextPage: true,
        endCursor: 'hostname-cursor',
        onLoadMore: baseProps.onLoadMore,
        loadingMore: false,
        fetchError: null,
        clearError: baseProps.clearError,
      }),
    )
    expect(screen.getByText('first.example.com')).toBeInTheDocument()
  })

  it('passes hasNextPage: false with no end cursor when there is no next page', () => {
    render(
      <AdditionalDomains
        {...baseProps}
        hasNextPage={false}
        endCursor={null}
      />,
    )

    expect(mockInfiniteScrollProps).toHaveBeenCalledWith(
      expect.objectContaining({ hasNextPage: false, endCursor: null }),
    )
  })
})
