import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { AddCommunityListItemForm } from '../add-community-list-item-form'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client'), () => ({
  addCommunityListItemByType: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

// Mock CommunityListAutocomplete to capture the onSelect callback
vi.mock(import('../community-list-autocomplete'), () => ({
  CommunityListAutocomplete: ({
    onSelect,
    itemType,
    disabled,
  }: {
    onSelect: (id: string) => void
    itemType: string
    disabled?: boolean
  }) => (
    <div>
      <input
        data-testid='autocomplete-input'
        placeholder={`Search ${itemType}s...`}
        aria-label={`Search ${itemType}s`}
        disabled={disabled}
        onChange={() => {}}
      />
      <button
        data-testid='select-item'
        onClick={() => onSelect('entity-id-1')}
        type='button'
      >
        Select {itemType}
      </button>
    </div>
  ),
}))

import { addCommunityListItemByType } from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'

const mockAddCommunityListItemByType = vi.mocked(addCommunityListItemByType)

describe('AddCommunityListItemForm', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders autocomplete for topic itemType', () => {
    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='topic'
      />,
    )
    expect(screen.getByTestId('autocomplete-input')).toBeDefined()
  })

  it('adds a topic when topic is selected', async () => {
    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='topic'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(mockAddCommunityListItemByType).toHaveBeenCalledWith(
        'test-community',
        'topic',
        'entity-id-1',
      )
    })
  })

  it('adds an rss_feed when rss_feed is selected', async () => {
    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='rss_feed'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(mockAddCommunityListItemByType).toHaveBeenCalledWith(
        'test-community',
        'rss_feed',
        'entity-id-1',
      )
    })
  })

  it('adds a post when post is selected', async () => {
    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='post'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(mockAddCommunityListItemByType).toHaveBeenCalledWith(
        'test-community',
        'post',
        'entity-id-1',
      )
    })
  })

  it('adds a domain when url_hostname is selected', async () => {
    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='url_hostname'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(mockAddCommunityListItemByType).toHaveBeenCalledWith(
        'test-community',
        'url_hostname',
        'entity-id-1',
      )
    })
  })

  it('adds a URL when url is selected', async () => {
    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='url'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(mockAddCommunityListItemByType).toHaveBeenCalledWith(
        'test-community',
        'url',
        'entity-id-1',
      )
    })
  })

  it('shows success toast after adding a topic', async () => {
    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='topic'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Topic added to list')
    })
  })

  it('disables autocomplete while submitting', async () => {
    let resolveFn!: () => void
    mockAddCommunityListItemByType.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveFn = resolve
        }),
    )

    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='topic'
      />,
    )

    fireEvent.click(screen.getByTestId('select-item'))

    await waitFor(() => {
      expect(screen.getByTestId('autocomplete-input')).toHaveProperty('disabled', true)
    })

    resolveFn()
  })

  it('shows ApiError message on failure', async () => {
    mockAddCommunityListItemByType.mockRejectedValueOnce(
      new ApiError('Topic already in list', 409, 'conflict'),
    )

    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='topic'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('conflict')
    })
  })

  it('shows fallback error message for non-ApiError', async () => {
    mockAddCommunityListItemByType.mockRejectedValueOnce(new Error('Network error'))

    render(
      <AddCommunityListItemForm
        communitySlug='test-community'
        itemType='topic'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to add Topic')
    })
  })
})
