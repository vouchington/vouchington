import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import CreateTopicPage from '../create-topic-client'
import { createTopic } from '@/lib/api/client/topics'
import { checkAvailability } from '@/lib/api/client/availability'
import { ApiError } from '@/lib/api/error'
import { NON_SOURCE_TOPIC_TYPE_OPTIONS } from '@/types/topics'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

const mockToastError = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockToastSuccess = vi.hoisted(() => vi.fn<VitestLooseMock>())

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

vi.mock(import('@/lib/api/client/availability'), () => ({
  checkAvailability: vi.fn<VitestLooseMock>(),
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
      toast: {
        error: mockToastError,
        success: mockToastSuccess,
      },
    }) as unknown as typeof import('sonner'),
)

const mockCreateTopic = vi.mocked(createTopic)
const mockCheckAvailability = vi.mocked(checkAvailability)

describe('CreateTopicPage', () => {
  let t: ReturnType<typeof createTranslator>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('checks name and slug availability on blur', async () => {
    mockCheckAvailability.mockResolvedValue({ available: true, conflict: null })
    render(<CreateTopicPage />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My New Topic' } })
    fireEvent.blur(screen.getByLabelText('Name'))
    fireEvent.blur(screen.getByLabelText('Slug'))

    await waitFor(() => {
      expect(mockCheckAvailability).toHaveBeenCalledWith(
        'topic-name',
        'My New Topic',
        expect.any(Object),
      )
      expect(mockCheckAvailability).toHaveBeenCalledWith(
        'topic-slug',
        'my-new-topic',
        expect.any(Object),
      )
    })
  })

  it('shows a taken indicator when the slug is in use', async () => {
    mockCheckAvailability.mockResolvedValue({
      available: false,
      conflict: { kind: 'topic', id: 't1', slug: 'taken-slug', name: 'Taken', topic_type: 'topic' },
    })
    render(<CreateTopicPage />)

    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'taken-slug' } })
    fireEvent.blur(screen.getByLabelText('Slug'))

    expect(await screen.findByText('topic slug used:')).toBeInTheDocument()
  })

  it('renders the heading and all form fields', () => {
    render(<CreateTopicPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Create Topic' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Slug')).toBeInTheDocument()
    expect(screen.getByLabelText('Topic Type')).toBeInTheDocument()
    expect(screen.getByLabelText('Hostname')).toBeInTheDocument()
    expect(screen.getByLabelText('Description (Markdown)')).toBeInTheDocument()
  })

  it('renders all shared topic type options', () => {
    render(<CreateTopicPage />)

    expect(
      screen.getAllByRole('option').map(option => ({
        value: option.getAttribute('value'),
        label: option.textContent,
      })),
    ).toEqual(
      NON_SOURCE_TOPIC_TYPE_OPTIONS.map(option => ({
        value: option.value,
        label: t(option.label),
      })),
    )
  })

  it('renders placeholders for all text fields', () => {
    render(<CreateTopicPage />)
    expect(screen.getByPlaceholderText('e.g. The Points Guy')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my-topic-slug')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. thepointsguy.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write a short Markdown description...')).toBeInTheDocument()
  })

  it('does not render the removed subtitle', () => {
    render(<CreateTopicPage />)
    expect(screen.queryByText('Create a new topic')).not.toBeInTheDocument()
  })

  it('form element has no bg-card class', () => {
    const { container } = render(<CreateTopicPage />)
    expect(container.querySelector('form')?.className).not.toMatch(/bg-card/)
  })

  it('auto-populates slug from name and stops when slug is manually edited', () => {
    render(<CreateTopicPage />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My New Topic' } })
    expect(screen.getByLabelText('Slug')).toHaveValue('my-new-topic')

    // Manual slug edit locks it
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'custom-slug' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Different Name' } })
    expect(screen.getByLabelText('Slug')).toHaveValue('custom-slug')
  })

  it('preserves an initial slug when the prefilled name changes', () => {
    mockNav.setSearchParams('name=Initial+Name&slug=locked-slug')
    render(<CreateTopicPage />)

    expect(screen.getByLabelText('Name')).toHaveValue('Initial Name')
    expect(screen.getByLabelText('Slug')).toHaveValue('locked-slug')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed Name' } })

    expect(screen.getByLabelText('Slug')).toHaveValue('locked-slug')
  })

  it('submits with correct payload and keeps button disabled while routing', async () => {
    mockCreateTopic.mockResolvedValue({
      topic: { id: 'abc-123', topic_type: 'topic' },
    } as Awaited<ReturnType<typeof createTopic>>)

    render(<CreateTopicPage />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Topic' } })
    // Slug auto-populates to 'test-topic'
    fireEvent.click(screen.getByRole('button', { name: 'Create Topic' }))

    await waitFor(() => {
      expect(mockCreateTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Topic',
          slug: 'test-topic',
          topic_type: 'topic',
        }),
      )
      expect(mockNav.push).toHaveBeenCalledWith('/topic/abc-123/settings')
    })

    // Button stays disabled through the router.push() transition
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled()
  })

  it('submits the selected shared topic type', async () => {
    mockCreateTopic.mockResolvedValue({
      topic: { id: 'abc-123', topic_type: 'bank_account' },
    } as Awaited<ReturnType<typeof createTopic>>)

    render(<CreateTopicPage />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Account' } })
    fireEvent.change(screen.getByLabelText('Topic Type'), {
      target: { value: 'bank_account' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Topic' }))

    await waitFor(() => {
      expect(mockCreateTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Account',
          slug: 'test-account',
          topic_type: 'bank_account',
        }),
      )
      expect(mockNav.push).toHaveBeenCalledWith('/bank-account/abc-123/settings')
    })
  })

  it('shows a toast and re-enables submit on ApiError', async () => {
    mockCreateTopic.mockRejectedValue(new ApiError('Slug already taken', 422))

    render(<CreateTopicPage />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Topic' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Topic' }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Slug already taken')
    })

    expect(screen.getByRole('button', { name: 'Create Topic' })).toBeEnabled()
  })

  it('shows a generic toast message on unexpected errors', async () => {
    mockCreateTopic.mockRejectedValue(new Error('Network error'))

    render(<CreateTopicPage />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Topic' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Topic' }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create topic')
    })
  })
})
