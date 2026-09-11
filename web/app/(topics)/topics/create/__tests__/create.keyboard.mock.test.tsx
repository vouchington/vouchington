import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import CreateTopicPage from '../create-topic-client'
import { createTopic } from '@/lib/api/client/topics'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/navigation/use-resolved-breadcrumbs'), () => ({
  useResolvedBreadcrumbs: vi.fn<VitestLooseMock>().mockReturnValue([]),
}))

const mockNav = createNavMock()

vi.mock(import('@/lib/api/client/topics'), () => ({
  createTopic: vi.fn<VitestLooseMock>(),
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
          id='topic_type'
          aria-label='Topic Type'
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
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockCreateTopic = vi.mocked(createTopic)

describe('CreateTopicPage — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockCreateTopic.mockResolvedValue({
      topic: { id: 'abc-123', topic_type: 'topic' },
    } as Awaited<ReturnType<typeof createTopic>>)
  })

  it('Enter on the name input submits via createTopic', async () => {
    render(<CreateTopicPage />)

    const name = screen.getByLabelText('Name') as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Test Topic' } })

    void expectInputEnterSubmits({ input: name, onSubmit: mockCreateTopic })

    await waitFor(() => {
      expect(mockCreateTopic).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Topic', slug: 'test-topic' }),
      )
    })
  })

  it('claims the preselected hashtag alias through the normal topic form', async () => {
    mockNav.setSearchParams(
      'name=Rust_lang.v2&slug=rust-lang-v2&source_topic_alias_id=alias-uuid-1',
    )
    render(<CreateTopicPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Create Topic' }))

    await waitFor(() => {
      expect(mockCreateTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Rust_lang.v2',
          slug: 'rust-lang-v2',
          source_topic_alias_id: 'alias-uuid-1',
        }),
      )
    })
  })

  it('Cmd+Enter and Ctrl+Enter on the description textarea submit; plain Enter does not', () => {
    render(<CreateTopicPage />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Topic' } })
    const textarea = screen.getByLabelText('Description (Markdown)') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'A short description' } })

    // Listen for the native submit event the design-system Textarea triggers via
    // form.requestSubmit(); the form's React onSubmit guards re-entry via setSaving so we
    // can't reuse the API client mock as the spy across all three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })
})
