import '@/test-helpers/i18n/mock-json-messages'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { ModlogFilters } from './modlog-filters'

const fetchUser = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/lib/api/client/users'),
  () => ({ fetchUser }) as unknown as typeof import('@/lib/api/client/users'),
)
vi.mock(
  import('@/components/users/user-autocomplete'),
  () =>
    ({
      UserAutocomplete: ({
        onChange,
        label,
        ariaLabel,
      }: {
        onChange: (id: string, label: string) => void
        label: string
        ariaLabel: string
      }) => (
        <>
          <input
            aria-label={ariaLabel}
            value={label}
            readOnly
          />
          <button
            type='button'
            onClick={() => onChange('user-2', 'user-2')}
          >
            Choose user
          </button>
          <button
            type='button'
            onClick={() => onChange('user-3', 'user-3')}
          >
            Choose other user
          </button>
        </>
      ),
    }) as unknown as typeof import('@/components/users/user-autocomplete'),
)
vi.mock(
  import('@/components/shared/entity-autocomplete'),
  () =>
    ({
      EntityAutocomplete: ({
        queryLabel,
        ariaLabel,
        onSelect,
      }: {
        queryLabel?: string
        ariaLabel: string
        onSelect: (item: { slug: string }, helpers: { setQuery: (query: string) => void }) => void
      }) => (
        <>
          <input
            aria-label={ariaLabel}
            value={queryLabel ?? ''}
            readOnly
          />
          <button
            type='button'
            onClick={() => onSelect({ slug: 'next-community' }, { setQuery: () => undefined })}
          >
            Choose community
          </button>
        </>
      ),
    }) as unknown as typeof import('@/components/shared/entity-autocomplete'),
)

const nav = createNavMock()

describe('ModlogFilters user selection', () => {
  beforeEach(() => {
    fetchUser.mockReset()
    nav.reset()
  })

  it('uses the fetched username instead of the autocomplete display label', async () => {
    fetchUser.mockResolvedValue({ user: { id: 'user-2', username: 'harbouruser' } })
    render(<ModlogFilters community='harbour' />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith('/admin/modlog?community=harbour&actor=harbouruser'),
    )
    expect(fetchUser).toHaveBeenCalledWith('user-2')
  })

  it('does not put an account ID in the URL when it has no username', async () => {
    fetchUser.mockResolvedValue({ user: { id: 'user-2', username: null } })
    render(<ModlogFilters />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    await waitFor(() => expect(fetchUser).toHaveBeenCalledWith('user-2'))
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('keeps retained identity filters out of inputs and preserves the other filter when clearing', () => {
    render(
      <ModlogFilters
        communityId='019f0000-0000-7000-8000-000000000002'
        actorId='019f0000-0000-7000-8000-000000000001'
      />,
    )
    expect(screen.getByLabelText('Filter by community')).toHaveValue('Deleted community')
    expect(screen.getByLabelText('Filter by user')).toHaveValue('Deleted user')
    fireEvent.click(screen.getByRole('button', { name: 'Clear user' }))
    expect(nav.push).toHaveBeenLastCalledWith(
      '/admin/modlog?community_id=019f0000-0000-7000-8000-000000000002',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear community' }))
    expect(nav.push).toHaveBeenLastCalledWith(
      '/admin/modlog?actor_user_id=019f0000-0000-7000-8000-000000000001',
    )
  })

  it('generates canonical selections while preserving another retained identity filter', async () => {
    fetchUser.mockResolvedValue({ user: { id: 'user-2', username: 'harbouruser' } })
    render(
      <ModlogFilters
        communityId='019f0000-0000-7000-8000-000000000002'
        actorId='019f0000-0000-7000-8000-000000000001'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    await waitFor(() =>
      expect(nav.push).toHaveBeenLastCalledWith(
        '/admin/modlog?actor=harbouruser&community_id=019f0000-0000-7000-8000-000000000002',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose community' }))
    expect(nav.push).toHaveBeenLastCalledWith(
      '/admin/modlog?community=next-community&actor_user_id=019f0000-0000-7000-8000-000000000001',
    )
  })

  it('ignores a late lookup after a newer user selection', async () => {
    let finishFirst!: (value: unknown) => void
    let finishSecond!: (value: unknown) => void
    fetchUser.mockReturnValueOnce(
      new Promise(resolve => {
        finishFirst = resolve
      }),
    )
    fetchUser.mockReturnValueOnce(
      new Promise(resolve => {
        finishSecond = resolve
      }),
    )
    render(<ModlogFilters />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose other user' }))
    finishSecond({ user: { id: 'user-3', username: 'newer' } })
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/admin/modlog?actor=newer'))
    await act(async () => finishFirst({ user: { id: 'user-2', username: 'older' } }))
    expect(nav.push).toHaveBeenCalledTimes(1)
  })

  it('ignores a pending user lookup after clearing the community filter', async () => {
    let finishLookup!: (value: unknown) => void
    fetchUser.mockReturnValueOnce(
      new Promise(resolve => {
        finishLookup = resolve
      }),
    )
    render(<ModlogFilters community='harbour' />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear community' }))
    expect(nav.push).toHaveBeenCalledWith('/admin/modlog')
    await act(async () => finishLookup({ user: { id: 'user-2', username: 'late' } }))
    expect(nav.push).toHaveBeenCalledTimes(1)
  })
})
