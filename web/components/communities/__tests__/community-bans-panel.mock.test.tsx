import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityBan, CommunityBansResponseBody } from '@/types/api-responses'
import { makeCommunity } from '@/test-helpers/api-responses/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'
import { ApiError } from '@vouchington/api-client'

// Components use data-pw (not data-testid) per project conventions.
configure({ testIdAttribute: 'data-pw' })

const { mockLiftBan, mockLiftAllBans, mockFetchCommunityBan, mockFetchCommunityBans, mockRefresh } =
  vi.hoisted(() => ({
    mockLiftBan: vi.fn<VitestLooseMock>(),
    mockLiftAllBans: vi.fn<VitestLooseMock>(),
    mockFetchCommunityBan: vi.fn<VitestLooseMock>(),
    mockFetchCommunityBans: vi.fn<VitestLooseMock>(),
    mockRefresh: vi.fn<() => void>(),
  }))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  liftBan: mockLiftBan,
  liftAllBans: mockLiftAllBans,
  fetchCommunityBan: mockFetchCommunityBan,
  fetchCommunityBans: mockFetchCommunityBans,
}))

import { CommunityBansPanel } from '../community-bans-panel'

function makeBan(overrides: Partial<CommunityBan> = {}): CommunityBan {
  return {
    __entity_type: 'community_ban',
    id: 'ban-1',
    community_id: 'c-1',
    user_id: 'u-1',
    banned_by_id: 'owner-1',
    reason: 'spam',
    expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    lifted_at: null,
    lifted_by_id: null,
    ...overrides,
  }
}

function makeData(bans: CommunityBan[], hasNext = false): CommunityBansResponseBody {
  return {
    results: bans.map(b => ({ __entity_type: 'community_ban' as const, id: b.id })),
    page_info: {
      has_next_page: hasNext,
      end_cursor: hasNext ? 'cursor' : null,
      start_cursor: null,
    },
    community_bans: Object.fromEntries(bans.map(b => [b.id, b])),
    users: { 'u-1': { ...publicUsers[0]!, id: 'u-1', username: 'spammer', display_account: null } },
  }
}

function renderPanel(bans: CommunityBan[]) {
  return render(
    <CommunityBansPanel
      community={makeCommunity()}
      initialData={makeData(bans)}
    />,
  )
}

describe('CommunityBansPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the empty state when there are no bans', () => {
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([])}
      />,
    )
    expect(screen.getByTestId('community-bans-empty')).toBeInTheDocument()
  })

  it('loads the reason only when details are requested', async () => {
    mockFetchCommunityBan.mockResolvedValueOnce({ community_ban: makeBan() })
    renderPanel([makeBan()])
    expect(screen.getByText('spammer')).toBeInTheDocument()
    expect(screen.queryByText('Reason: spam')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(await screen.findByText('Reason: spam')).toBeInTheDocument()
    expect(screen.getByTestId('community-ban-lift')).toBeInTheDocument()
  })

  it('prefers the banned user display name to the username', () => {
    const data = makeData([makeBan()])
    data.users['u-1'] = { ...data.users['u-1']!, display_account: { name: 'Display name' } }
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={data}
      />,
    )
    expect(screen.getByText('Display name')).toBeInTheDocument()
    expect(screen.queryByText('spammer')).not.toBeInTheDocument()
  })

  it('shows a translated deleted-user label when the banned profile is gone', async () => {
    mergeMessages('es', await loadJsonMessages('es'))
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={{
          ...makeData([
            makeBan(),
            makeBan({ id: 'ban-lifted', lifted_at: '2026-02-01T00:00:00.000Z' }),
            makeBan({ id: 'ban-expired', expires_at: '2000-01-01T00:00:00.000Z' }),
          ]),
          users: {},
        }}
      />,
      {
        wrapper: ({ children }) => <LocaleProvider locale='es'>{children}</LocaleProvider>,
      },
    )
    expect(screen.getAllByText('Usuario eliminado')).toHaveLength(3)
    expect(screen.getByText('Activo')).toBeVisible()
    expect(screen.getByText('Levantado')).toBeVisible()
    expect(screen.getByText('Vencido')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Levantar ban' })).toBeVisible()
    expect(screen.queryByText('u-1')).not.toBeInTheDocument()
  })

  it('lifts a ban and refreshes', async () => {
    mockLiftBan.mockResolvedValueOnce({ lifted_ban_ids: ['ban-1'] })
    renderPanel([makeBan()])

    fireEvent.click(screen.getByTestId('community-ban-lift'))

    await waitFor(() => expect(mockLiftBan).toHaveBeenCalledWith('test-community', 'ban-1'))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(screen.getByText('Lifted')).toBeVisible()
    expect(screen.getByText(/^Lifted: /).textContent).toMatch(/^Lifted: \d{4}-\d{2}-\d{2}$/)
  })

  it('lifts only the selected ban and keeps sibling bans unchanged', async () => {
    mockLiftBan.mockResolvedValueOnce({ lifted_ban_ids: ['ban-active'] })
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([
          makeBan({ id: 'ban-active' }),
          makeBan({ id: 'ban-active-timed', expires_at: '2999-01-01T00:00:00.000Z' }),
          makeBan({ id: 'ban-expired', expires_at: '2000-01-01T00:00:00.000Z' }),
        ])}
      />,
    )

    fireEvent.click(screen.getAllByTestId('community-ban-lift')[0]!)

    await waitFor(() => expect(mockLiftBan).toHaveBeenCalledWith('test-community', 'ban-active'))
    const [activeRow, timedRow, expiredRow] = screen.getAllByTestId('community-ban-row')
    expect(activeRow).toHaveTextContent('Lifted')
    expect(timedRow).toHaveTextContent('Active')
    expect(expiredRow).toHaveTextContent('Expired')
    expect(expiredRow).not.toHaveTextContent('Lifted')
  })

  it('disables all lift actions until the pending request completes', async () => {
    let resolveLift!: (result: { lifted_ban_ids: string[] }) => void
    mockLiftBan.mockReturnValueOnce(
      new Promise(resolve => {
        resolveLift = resolve
      }),
    )
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan(), makeBan({ id: 'ban-2' })])}
      />,
    )
    const buttons = screen.getAllByTestId('community-ban-lift')
    fireEvent.click(buttons[0]!)
    expect(buttons[0]).toBeDisabled()
    expect(buttons[1]).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: 'Lift all bans' })) {
      expect(button).toBeDisabled()
    }
    resolveLift({ lifted_ban_ids: ['ban-1'] })
    await waitFor(() => expect(screen.getByTestId('community-ban-lift')).toBeEnabled())
  })

  it('confirms lift all and applies only the returned ban ids', async () => {
    mockLiftAllBans.mockResolvedValueOnce({ lifted_ban_ids: ['ban-1', 'ban-2'] })
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan(), makeBan({ id: 'ban-2' })])}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Lift all bans' })[0]!)
    expect(mockLiftAllBans).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button:last-child')!)
    await waitFor(() => expect(mockLiftAllBans).toHaveBeenCalledWith('test-community', 'u-1'))
    expect(screen.getAllByText('Lifted')).toHaveLength(2)
  })

  it.each([
    [
      'COMMUNITY_BAN_LIFT_ALL_FORBIDDEN',
      403,
      undefined,
      'Some bans cannot be lifted together. Lift permitted bans individually.',
    ],
    [
      'COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED',
      409,
      3,
      'More than 3 bans are active. Lift bans individually.',
    ],
  ])('shows localized guidance for %s', async (code, status, cap, expected) => {
    mockLiftAllBans.mockRejectedValueOnce(new ApiError('server message', status, { code, cap }))
    renderPanel([makeBan()])
    fireEvent.click(screen.getByRole('button', { name: 'Lift all bans' }))
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button:last-child')!)
    expect(await screen.findByText(expected)).toBeVisible()
    expect(screen.queryByText('server message')).not.toBeInTheDocument()
  })

  it('shows an error when lift fails', async () => {
    mockLiftBan.mockRejectedValueOnce(new Error('nope'))
    renderPanel([makeBan()])

    fireEvent.click(screen.getByTestId('community-ban-lift'))

    expect(await screen.findByText('Failed to lift ban')).toBeInTheDocument()
    expect(screen.queryByText('nope')).not.toBeInTheDocument()
    mockFetchCommunityBan.mockRejectedValueOnce(new Error('private server detail'))
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    await waitFor(() => expect(mockFetchCommunityBan).toHaveBeenCalled())
    expect(screen.getByText('Failed to lift ban')).toBeInTheDocument()
    expect(screen.queryByText('private server detail')).not.toBeInTheDocument()
  })

  it('does not render a lift button for an already-lifted ban', () => {
    renderPanel([makeBan({ lifted_at: '2026-02-01T00:00:00.000Z' })])
    expect(screen.queryByTestId('community-ban-lift')).not.toBeInTheDocument()
    expect(screen.getByText('Lifted')).toBeInTheDocument()
  })

  it('labels a naturally-expired ban as Expired (not lifted) with no lift button', () => {
    renderPanel([makeBan({ expires_at: '2000-01-01T00:00:00.000Z' })])
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.queryByTestId('community-ban-lift')).not.toBeInTheDocument()
  })

  it('loads more bans when paginated', async () => {
    mockFetchCommunityBans.mockResolvedValueOnce(
      makeData([makeBan({ id: 'ban-2', user_id: 'u-2' })]),
    )
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan()], true)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() =>
      expect(mockFetchCommunityBans).toHaveBeenCalledWith('test-community', 'cursor'),
    )
  })
})
