import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockRefresh, mockTagList } = vi.hoisted(() => ({
  mockRefresh: vi.fn<() => void>(),
  mockTagList: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/components/tags/tag-list'),
  () =>
    ({
      TagList: (props: Record<string, unknown>) => {
        mockTagList(props)
        return <div />
      },
    }) as unknown as typeof import('@/components/tags/tag-list'),
)

import { UserTagsList } from '../user-tags-list'

describe('UserTagsList', () => {
  it('refreshes the streamed profile aside after a vote succeeds', () => {
    render(
      <UserTagsList
        relations={[]}
        canManageUserTags
      />,
    )

    const onVoteSubmitted = mockTagList.mock.lastCall?.[0]?.onVoteSubmitted as () => void
    onVoteSubmitted()
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('passes the profile relation permission to TagList instead of its structural default', () => {
    render(
      <UserTagsList
        relations={[]}
        canManageUserTags={false}
      />,
    )

    expect(mockTagList.mock.lastCall?.[0]).toMatchObject({ allowOfficialAccounts: false })
  })
})
