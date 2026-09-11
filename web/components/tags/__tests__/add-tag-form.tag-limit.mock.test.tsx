import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createEntityRelation } from '@/lib/api/client/entity-relations'
import onError from '@/lib/on-error'
import { ApiError } from '@/lib/api/error'
import { AddTagForm } from '../add-tag-form'

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
  createEntityRelation: vi.fn<VitestLooseMock>(),
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

describe('AddTagForm when createEntityRelation rejects with TAG_LIMIT_REACHED', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the tag limit CTA instead of calling onError', async () => {
    mockCreate.mockRejectedValueOnce(
      new ApiError('Tag limit reached', 403, { code: 'TAG_LIMIT_REACHED' }),
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
      expect(screen.getByText("You've reached your tag limit")).toBeInTheDocument()
    })
    expect(mockOnError).not.toHaveBeenCalled()
    const upgradeLink = screen.getByRole('link', { name: 'View plans' })
    expect(upgradeLink.getAttribute('href')).toBe('/plans')
  })

  it('does not call onTagAdded', async () => {
    const onTagAdded = vi.fn<() => void>()
    mockCreate.mockRejectedValueOnce(
      new ApiError('Tag limit reached', 403, { code: 'TAG_LIMIT_REACHED' }),
    )

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
      expect(screen.getByText("You've reached your tag limit")).toBeInTheDocument()
    })
    expect(onTagAdded).not.toHaveBeenCalled()
  })
})
