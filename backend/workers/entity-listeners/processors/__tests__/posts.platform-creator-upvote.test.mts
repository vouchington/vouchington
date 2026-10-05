import { describe, expect, it } from 'vitest'
import { countPostElectionVoteRowsForUser, insertTestPost } from '@voucha/test-helpers'
import {
  createPlatformAccountTestUser,
  type PlatformAccountTestKind,
} from '@voucha/test-helpers/account-types'
import { getPostElectionVote } from '@services/elections-votes/post'
import { processPostCreated } from '../posts.mts'

const KINDS: PlatformAccountTestKind[] = ['official', 'system', 'ai_agent']

describe('processPostCreated automatic vote for platform accounts', () => {
  it.each(KINDS)('casts no automatic post vote for a %s creator', async kind => {
    const creator = await createPlatformAccountTestUser(kind)
    const suffix = crypto.randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      title: `Platform creator post ${suffix}`,
      slug: `platform-creator-post-${suffix}`,
      createdById: creator.id,
      markdown: 'Platform creator post content',
    })

    await processPostCreated({ id: postId })

    expect(await getPostElectionVote(creator.id, postId)).toBeNull()
    expect(await countPostElectionVoteRowsForUser(creator.id)).toBe(0)
  })
})
