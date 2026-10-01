import type { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import type { PrivateUser } from '@services/users/types'
import { describe, expect, it, vi } from 'vitest'
import { applyPostCommitSideEffects } from './post-commit-side-effects.mts'

const creator = { id: 'creator-id', roles: [] } as unknown as PrivateUser

describe('applyPostCommitSideEffects', () => {
  it('dispatches the post-created listeners once after commit', async () => {
    const enqueuePostCreated = vi.fn<typeof enqueueOnPostCreated>(() => Promise.resolve())

    await applyPostCommitSideEffects(
      {
        creator,
        post: { id: 'post-id' },
        postType: 'discussion',
        updates: {},
      },
      { enqueueOnPostCreated: enqueuePostCreated },
    )

    expect(enqueuePostCreated).toHaveBeenCalledOnce()
    expect(enqueuePostCreated).toHaveBeenCalledWith('post-id')
  })
})
