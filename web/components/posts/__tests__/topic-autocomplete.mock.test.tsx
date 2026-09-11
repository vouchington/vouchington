import { describe, it, expect, vi, afterEach } from 'vitest'
import { createContext, use } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TopicAutocomplete } from '../topic-autocomplete'

// Mock Popover components to avoid portal/DOM issues in tests.
// Context is created inside the factory so it's available when the factory runs
// (vi.mock is hoisted before module-level declarations).
// PopoverContent reads open state from context so visibility is correct
// regardless of component render order.
vi.mock(import('@/components/ui/popover'), () => {
  const PopoverContext = createContext(false)
  return {
    Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <PopoverContext.Provider value={!!open}>{children}</PopoverContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const open = use(PopoverContext)
      return open ? <div>{children}</div> : null
    },
  } as unknown as typeof import('@/components/ui/popover')
})

// Mock cmdk-based Command components to avoid ResizeObserver dependency
vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      CommandInput: ({
        placeholder,
        value,
        'aria-label': ariaLabel,
        onValueChange,
        onFocus,
        onKeyDown,
      }: {
        placeholder?: string
        value?: string
        'aria-label'?: string
        onValueChange?: (v: string) => void
        onFocus?: () => void
        onKeyDown?: (e: React.KeyboardEvent) => void
      }) => (
        <input
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={e => onValueChange?.(e.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        />
      ),
      CommandList: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
      CommandEmpty: ({ children }: { children: React.ReactNode }) => (
        <li data-testid='command-empty'>{children}</li>
      ),
      CommandItem: ({
        children,
        onSelect,
      }: {
        children: React.ReactNode
        onSelect?: () => void
      }) => (
        <li>
          <button
            type='button'
            onClick={onSelect}
          >
            {children}
          </button>
        </li>
      ),
    }) as unknown as typeof import('@/components/ui/command'),
)

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopics: vi.fn<VitestLooseMock>().mockResolvedValue({
    topics: {},
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    topics_metrics: {},
  }),
}))

import { fetchTopics } from '@/lib/api/client/topics'

const mockFetchTopics = vi.mocked(fetchTopics)

describe('TopicAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    render(
      <TopicAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search topics...')).toBeDefined()
  })

  it('uses a caller-provided accessible name for specialized topic searches', () => {
    render(
      <TopicAutocomplete
        value={null}
        label=''
        ariaLabel='Search referral programs'
        placeholder='Search referral programs…'
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Search referral programs' })).toBeDefined()
  })

  it('shows provided label as initial value', () => {
    render(
      <TopicAutocomplete
        value='topic-1'
        label='Chase Sapphire'
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...') as HTMLInputElement
    expect(input.value).toBe('Chase Sapphire')
  })

  it('opens dropdown and shows empty state on input change', () => {
    render(
      <TopicAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'chase' } })
    expect(screen.getByTestId('command-empty')).toBeDefined()
  })

  it('shows topic results after fetch', async () => {
    mockFetchTopics.mockResolvedValueOnce({
      topics: {
        'topic-1': {
          __entity_type: 'topic',
          id: 'topic-1',
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          markdown: '',
          aliases: [],
          topic_type: 'card',
          noindex: false,
          allow_reviews: true,
          created_at: '2024-01-01T00:00:00Z',
          logo_image_id: null,
          hero_image_id: null,
          rewards_program_id: null,
          referral_program_id: null,
          created_by: { id: 'user-1', display_name: null, display_name_url_id: null },
          updated_by: { id: 'user-1', display_name: null, display_name_url_id: null },
        },
      },
      results: [
        {
          __entity_type: 'topic',
          id: 'topic-1',
          ranking: 1,
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          topic_type: 'card',
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics_metrics: {},
    })

    render(
      <TopicAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'chase' } })

    await waitFor(
      () => {
        expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined()
      },
      { timeout: 500 },
    )
  })

  it('calls onChange when a topic is selected', async () => {
    mockFetchTopics.mockResolvedValueOnce({
      topics: {
        'topic-1': {
          __entity_type: 'topic',
          id: 'topic-1',
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          markdown: '',
          aliases: [],
          topic_type: 'card',
          noindex: false,
          allow_reviews: true,
          created_at: '2024-01-01T00:00:00Z',
          logo_image_id: null,
          hero_image_id: null,
          rewards_program_id: null,
          referral_program_id: null,
          created_by: { id: 'user-1', display_name: null, display_name_url_id: null },
          updated_by: { id: 'user-1', display_name: null, display_name_url_id: null },
        },
      },
      results: [
        {
          __entity_type: 'topic',
          id: 'topic-1',
          ranking: 1,
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          topic_type: 'card',
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics_metrics: {},
    })

    const onTopicSelect = vi.fn<VitestLooseMock>()
    render(
      <TopicAutocomplete
        value={null}
        label=''
        onChange={onTopicSelect}
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'chase' } })

    await waitFor(
      () => {
        expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined()
      },
      { timeout: 500 },
    )

    fireEvent.click(screen.getByText('Chase Sapphire Reserve'))
    expect(onTopicSelect).toHaveBeenCalledWith('topic-1', 'Chase Sapphire Reserve')
  })

  it('clears the stored id when text is edited and clearOnTextEdit + a value are set', () => {
    const onTopicChange = vi.fn<VitestLooseMock>()
    render(
      <TopicAutocomplete
        value='topic-1'
        label='Chase Sapphire'
        onChange={onTopicChange}
        clearOnTextEdit
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'Chase Sapphir' } })
    expect(onTopicChange).toHaveBeenCalledWith('', 'Chase Sapphir')
  })

  it('does not clear on text edit when no value is selected', () => {
    const onTopicChange = vi.fn<VitestLooseMock>()
    render(
      <TopicAutocomplete
        value={null}
        label=''
        onChange={onTopicChange}
        clearOnTextEdit
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'chase' } })
    expect(onTopicChange).not.toHaveBeenCalled()
  })
  it('does not clear on text edit when clearOnTextEdit is off', () => {
    const onTopicChange = vi.fn<VitestLooseMock>()
    render(
      <TopicAutocomplete
        value='topic-1'
        label='Chase Sapphire'
        onChange={onTopicChange}
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'Chase Sapphir' } })
    expect(onTopicChange).not.toHaveBeenCalled()
  })
})
