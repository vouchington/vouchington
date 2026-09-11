import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectTextareaCmdEnterSubmits } from '@/test-helpers/form-keyboard'
import { AliasesClient } from '../aliases-client'
import { createTopicAliases, deleteTopicAlias, fetchTopicAliases } from '@/lib/api/client/topics'
import { ApiError } from '@/lib/api/error'
import { toast } from 'sonner'
import type { Topic } from '@/types/topics'

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopicAliases: vi.fn<VitestLooseMock>(),
  createTopicAliases: vi.fn<VitestLooseMock>(),
  deleteTopicAlias: vi.fn<VitestLooseMock>(),
  fetchTopics: vi.fn<VitestLooseMock>(),
  mergeTopicAliases: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockFetchTopicAliases = vi.mocked(fetchTopicAliases)
const mockCreateTopicAliases = vi.mocked(createTopicAliases)
const mockDeleteTopicAlias = vi.mocked(deleteTopicAlias)
const mockToast = vi.mocked(toast)

function initialAliasesData(aliases: string[]) {
  return {
    results: aliases.map(alias => ({ id: `id-${alias}`, alias })),
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

const baseTopic: Topic = {
  __entity_type: 'topic',
  id: 'topic-1',
  name: 'Topic',
  slug: 'topic',
  markdown: '',
  aliases: [],
  topic_type: 'topic',
  noindex: false,
  allow_reviews: true,
  created_at: '2026-01-01T00:00:00.000Z',
  hostname_id: null,
  hostname: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { id: 'u1', display_name: null, display_name_url_id: null },
  updated_by: { id: 'u1', display_name: null, display_name_url_id: null },
}

describe('AliasesClient — add aliases error path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateTopicAliases.mockRejectedValue(new ApiError('Alias already exists', 409))
  })

  it('shows an error toast when createTopicAliases rejects', async () => {
    render(
      <AliasesClient
        topic={baseTopic}
        initialData={initialAliasesData([])}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Add Aliases' })

    const textarea = screen.getByLabelText(
      'Aliases (comma, semicolon, or newline separated)',
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'bad-alias' } })
    fireEvent.submit(textarea.form!)

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Alias already exists')
    })
  })
})

describe('AliasesClient — alias list rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchTopicAliases.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    } as unknown as Awaited<ReturnType<typeof fetchTopicAliases>>)
    mockDeleteTopicAlias.mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof deleteTopicAlias>>,
    )
  })

  it('renders alias list items when initialAliases is non-empty', async () => {
    render(
      <AliasesClient
        topic={baseTopic}
        initialData={initialAliasesData(['alias1', 'alias2'])}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Add Aliases' })

    expect(screen.getByText('alias1')).toBeInTheDocument()
    expect(screen.getByText('alias2')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
  })

  it('does not offer removal for the active slug alias', async () => {
    render(
      <AliasesClient
        topic={baseTopic}
        initialData={initialAliasesData(['topic', 'alias1'])}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Add Aliases' })

    expect(screen.getByText('topic')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)
    expect(document.querySelector('[data-pw="alias-remove-topic"]')).toBeNull()
  })

  it('removes alias from list and shows success toast on successful delete', async () => {
    render(
      <AliasesClient
        topic={baseTopic}
        initialData={initialAliasesData(['alias1'])}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Add Aliases' })

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(mockDeleteTopicAlias).toHaveBeenCalledWith('topic-1', 'id-alias1')
      expect(mockToast.success).toHaveBeenCalledWith('Alias "alias1" removed')
    })

    expect(screen.queryByText('alias1')).not.toBeInTheDocument()
  })

  it('shows error toast when deleteTopicAlias rejects', async () => {
    mockDeleteTopicAlias.mockRejectedValue(new ApiError('Cannot delete alias', 409))

    render(
      <AliasesClient
        topic={baseTopic}
        initialData={initialAliasesData(['alias1'])}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Add Aliases' })

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Cannot delete alias')
    })

    // Alias remains in the list after failed delete
    expect(screen.getByText('alias1')).toBeInTheDocument()
  })
})

describe('AliasesClient — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchTopicAliases.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    } as unknown as Awaited<ReturnType<typeof fetchTopicAliases>>)
    mockCreateTopicAliases.mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof createTopicAliases>>,
    )
  })

  it('Cmd+Enter on the aliases textarea submits via createTopicAliases; plain Enter does not', async () => {
    render(
      <AliasesClient
        topic={baseTopic}
        initialData={initialAliasesData([])}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Add Aliases' })

    const textarea = screen.getByLabelText(
      'Aliases (comma, semicolon, or newline separated)',
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'alias1, alias2' } })

    // Spy on the native submit event because the form's React onSubmit short-circuits
    // re-entry (saving state) between the three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })
})
