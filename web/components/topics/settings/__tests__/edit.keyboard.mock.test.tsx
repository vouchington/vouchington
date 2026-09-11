import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import { AboutClient } from '../about-client'
import { updateTopic } from '@/lib/api/client/topics'
import type { Topic } from '@/types/topics'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ replace: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/topics'), () => ({
  getTopicTypeAttributes: vi.fn<VitestLooseMock>(),
  updateTopic: vi.fn<VitestLooseMock>(),
  updateTopicTypeAttributes: vi.fn<VitestLooseMock>(),
  updateSpendingCategoryAttributes: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        <select
          aria-label='Type'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockUpdateTopic = vi.mocked(updateTopic)

const baseTopic: Topic = {
  __entity_type: 'topic',
  id: 'topic-123',
  name: 'Original Topic',
  slug: 'original-topic',
  markdown: 'original markdown',
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

const baseInitialData = {
  isForeignTransaction: false,
  loadError: null,
  loading: false,
  spendingFrequency: '',
  topic: baseTopic,
  topicTypeValue: 'topic',
  typeAttributes: null,
  typeSaving: false,
}

describe('AboutClient — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateTopic.mockResolvedValue({ topic: baseTopic } as Awaited<
      ReturnType<typeof updateTopic>
    >)
  })

  it('Enter on the basic-info name input submits via updateTopic', async () => {
    render(
      <AboutClient
        id='topic-123'
        topicType='topic'
        initialData={baseInitialData}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Basic Info' })

    const input = screen.getByLabelText('Name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Renamed Topic' } })

    void expectInputEnterSubmits({ input, onSubmit: mockUpdateTopic })

    await waitFor(() => {
      expect(mockUpdateTopic).toHaveBeenCalledWith(
        'topic-123',
        expect.objectContaining({ name: 'Renamed Topic' }),
      )
    })
  })

  it('Cmd+Enter and Ctrl+Enter on the markdown textarea submit; plain Enter does not', async () => {
    render(
      <AboutClient
        id='topic-123'
        topicType='topic'
        initialData={baseInitialData}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Basic Info' })

    const textarea = screen.getByLabelText('Markdown') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'updated markdown' } })

    // Spy on the native submit event because the form's React onSubmit short-circuits
    // re-entry (saving state) between the three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })
})
