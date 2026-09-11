import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import UserVouchFollowContext from '../user-vouch-follow-context'
import type { FollowContextUsers, UserVouchContextResponseBody } from '@/types/api-responses'
import type { PublicUser, User } from '@/types/user'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
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

const getCurrentUser = vi.fn<() => Promise<User | null>>()
const getUserVouchContext = vi.fn<(id: string) => Promise<UserVouchContextResponseBody | null>>()
const headersMock = vi.fn<() => Promise<{ get: (name: string) => string | null }>>(async () => ({
  get: () => null,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: () => getCurrentUser(),
}))

vi.mock(
  import('next/headers'),
  () =>
    ({
      headers: () => headersMock(),
    }) as unknown as typeof import('next/headers'),
)

vi.mock(import('@/lib/api/server'), () => ({
  getUserVouchContext: (id: string) => getUserVouchContext(id),
}))

const sampleUser: PublicUser = {
  id: 'user-2',
  username: 'voucher',
  profile_image_id: null,
}

const currentUser: User = {
  id: 'me',
  username: 'me',
} as unknown as User

const emptySection: FollowContextUsers = { total: 0, users: [] }

async function renderRsc(node: Promise<ReactNode>) {
  const resolved = await node
  return render(resolved)
}

describe('UserVouchFollowContext', () => {
  it('returns null for anonymous viewers', async () => {
    getCurrentUser.mockResolvedValue(null)

    const { container } = await renderRsc(UserVouchFollowContext({ id: 'user-2' }))

    expect(container).toBeEmptyDOMElement()
    expect(getUserVouchContext).not.toHaveBeenCalled()
  })

  it('returns null when both totals are zero', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getUserVouchContext.mockResolvedValueOnce({
      positive_by_following: emptySection,
      negative_by_following: emptySection,
      election_vote: null,
    })

    const { container } = await renderRsc(UserVouchFollowContext({ id: 'user-2' }))

    expect(container).toBeEmptyDOMElement()
  })

  it('returns null when context fetch returns null (e.g. 403)', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getUserVouchContext.mockResolvedValueOnce(null)

    const { container } = await renderRsc(UserVouchFollowContext({ id: 'user-2' }))

    expect(container).toBeEmptyDOMElement()
  })

  it('renders both vouch and disavow sections when populated', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getUserVouchContext.mockResolvedValueOnce({
      positive_by_following: { total: 1, users: [sampleUser] },
      negative_by_following: emptySection,
      election_vote: null,
    })

    await renderRsc(UserVouchFollowContext({ id: 'user-2' }))

    expect(screen.getByText('From People You Follow')).toBeDefined()
    expect(screen.getByText('Positive signals for this user')).toBeDefined()
    expect(screen.getByText('Negative signals for this user')).toBeDefined()
    expect(screen.getByText('voucher')).toBeDefined()
  })
})
