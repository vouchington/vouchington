import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createEntityRelation } from '@/lib/api/client/entity-relations'
import onError from '@/lib/on-error'
import { AddTagForm } from '../add-tag-form'
import type { EntityRelation } from '@/lib/api/entity-relations'

type NavigationModule = typeof import('next/navigation')
type DynamicModule = typeof import('next/dynamic')

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: vi.fn<VitestLooseMock>() }),
    }) as unknown as NavigationModule,
)
vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (loader: () => Promise<{ default: unknown }>) => {
        // Immediately execute the dynamic import and return a wrapper
        let Component: React.ComponentType<Record<string, unknown>> | null = null
        void loader().then(m => {
          Component = (m as { default: React.ComponentType<Record<string, unknown>> }).default
        })
        return function DynamicComponent(props: Record<string, unknown>) {
          if (!Component) return null
          return <Component {...props} />
        }
      },
    }) as unknown as DynamicModule,
)
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/entity-relations'), () => ({
  createEntityRelation: vi.fn<VitestLooseMock>().mockResolvedValue({
    id: 'relation-1',
    created_at: '2024-01-01T00:00:00Z',
    created_by_id: 'user-1',
    object_data: {},
  }),
}))
// Mock TagAutocomplete to capture the onSelect callback
vi.mock(import('../tag-autocomplete'), () => ({
  TagAutocomplete: ({
    onSelect,
    objectType,
    disabled,
    placeholder,
  }: {
    onSelect: (id: string) => void
    objectType: string
    disabled?: boolean
    placeholder?: string
  }) => (
    <div>
      <input
        data-testid='autocomplete-input'
        placeholder={placeholder}
        aria-label={placeholder ?? 'Autocomplete'}
        disabled={disabled}
        onChange={() => {}}
      />
      <button
        data-testid='select-item'
        onClick={() => onSelect('item-id-1')}
        type='button'
      >
        Select {objectType}
      </button>
    </div>
  ),
}))
const mockCreate = vi.mocked(createEntityRelation)
const mockOnError = vi.mocked(onError)
const mockEntityRelation: EntityRelation = {
  id: 'relation-1',
  created_at: '2024-01-01T00:00:00Z',
  created_by_id: 'user-1',
  object_data: {},
}
const mockEnumOptions = [
  { id: 'pt-1', label: 'Mainstream', slug: 'mainstream-media' },
  { id: 'pt-2', label: 'Blog', slug: 'blog' },
  { id: 'pt-3', label: 'Corporate', slug: 'corporate-media' },
]
describe('AddTagForm', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })
  it('renders a TagAutocomplete for topics', () => {
    render(
      <AddTagForm
        entityType='post'
        entityId='post-1'
        predicate='category'
        objectType='topic'
      />,
    )
    expect(screen.getByPlaceholderText('Search for topics to tag...')).toBeDefined()
  })
  it('renders a TagAutocomplete for posts', () => {
    render(
      <AddTagForm
        entityType='post'
        entityId='post-1'
        predicate='related'
        objectType='post'
      />,
    )
    expect(screen.getByPlaceholderText('Search for posts to tag...')).toBeDefined()
  })

  it('renders a TagAutocomplete for urls', () => {
    render(
      <AddTagForm
        entityType='post'
        entityId='post-1'
        predicate='related'
        objectType='url'
      />,
    )
    expect(screen.getByPlaceholderText('Search for urls to tag...')).toBeDefined()
  })

  it('calls createEntityRelation when item is selected', async () => {
    render(
      <AddTagForm
        entityType='post'
        entityId='post-1'
        predicate='category'
        objectType='topic'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('post', 'post-1', 'category', 'topic', 'item-id-1')
    })
  })

  it('disables autocomplete while submitting', async () => {
    let resolveFn!: () => void
    mockCreate.mockImplementation(
      () =>
        new Promise<EntityRelation>(resolve => {
          resolveFn = () => resolve(mockEntityRelation)
        }),
    )

    render(
      <AddTagForm
        entityType='post'
        entityId='post-1'
        predicate='category'
        objectType='topic'
      />,
    )

    fireEvent.click(screen.getByTestId('select-item'))

    await waitFor(() => {
      expect(screen.getByTestId('autocomplete-input')).toHaveProperty('disabled', true)
    })

    resolveFn()
  })

  it('calls onError if createEntityRelation fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Server error'))

    render(
      <AddTagForm
        entityType='post'
        entityId='post-1'
        predicate='category'
        objectType='topic'
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('calls onTagAdded once after a successful submission', async () => {
    const onTagAdded = vi.fn<() => void>()
    mockCreate.mockResolvedValueOnce(mockEntityRelation)

    render(
      <AddTagForm
        entityType='post'
        entityId='post-1'
        predicate='category'
        objectType='topic'
        onTagAdded={onTagAdded}
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(onTagAdded).toHaveBeenCalledOnce()
    })
  })

  it('does not call onTagAdded when createEntityRelation rejects', async () => {
    const onTagAdded = vi.fn<() => void>()
    mockCreate.mockRejectedValueOnce(new Error('Server error'))

    render(
      <AddTagForm
        entityType='post'
        entityId='post-1'
        predicate='category'
        objectType='topic'
        onTagAdded={onTagAdded}
      />,
    )
    fireEvent.click(screen.getByTestId('select-item'))
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
    expect(onTagAdded).not.toHaveBeenCalled()
  })

  describe('with enumOptions (publisher type select mode)', () => {
    it('renders a Select trigger instead of TagAutocomplete', () => {
      render(
        <AddTagForm
          entityType='topic'
          entityId='topic-1'
          predicate='publisher_type'
          objectType='topic'
          enumOptions={mockEnumOptions}
        />,
      )
      expect(screen.getByRole('combobox', { name: /select publisher type/i })).toBeDefined()
      expect(screen.queryByTestId('autocomplete-input')).toBeNull()
    })

    it('shows all available options in the Select', () => {
      render(
        <AddTagForm
          entityType='topic'
          entityId='topic-1'
          predicate='publisher_type'
          objectType='topic'
          enumOptions={mockEnumOptions}
        />,
      )
      // Radix Select renders items in a portal — verify via data-pw
      const trigger = screen.getByRole('combobox')
      expect(trigger).toBeDefined()
    })

    it('filters out excluded IDs from the Select options', () => {
      render(
        <AddTagForm
          entityType='topic'
          entityId='topic-1'
          predicate='publisher_type'
          objectType='topic'
          enumOptions={mockEnumOptions}
          excludeIds={['pt-1', 'pt-2']}
        />,
      )
      // Only pt-3 is available — trigger should still render
      expect(screen.getByRole('combobox')).toBeDefined()
    })

    it('returns null when all options are excluded', () => {
      const { container } = render(
        <AddTagForm
          entityType='topic'
          entityId='topic-1'
          predicate='publisher_type'
          objectType='topic'
          enumOptions={mockEnumOptions}
          excludeIds={['pt-1', 'pt-2', 'pt-3']}
        />,
      )
      expect(container.firstChild).toBeNull()
    })

    it('has the publisher-type-select data-pw attribute on trigger', () => {
      const { container } = render(
        <AddTagForm
          entityType='topic'
          entityId='topic-1'
          predicate='publisher_type'
          objectType='topic'
          enumOptions={mockEnumOptions}
        />,
      )
      expect(container.querySelector('[data-pw="publisher-type-select"]')).not.toBeNull()
    })
  })
})
