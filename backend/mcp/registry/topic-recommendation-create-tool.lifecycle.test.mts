import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  getContributionAdmissionConsumptionCountForTest,
  getContributionAdmissionReservationStateForTest,
} from '@voucha/test-helpers'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  withConcurrentActorSuspensionForTest,
  withConcurrentActorDeletionForTest,
} from '@voucha/test-helpers/post-delegated-write-race'

import { countTestPostsCreatedBy } from '@voucha/test-helpers/entities/posts-deletion'

const SCOPES = ['topic-recommendations:read', 'topic-recommendations:write'] as const

describe('delegated recommendation author lifecycle', () => {
  it.each(['suspension', 'deletion'] as const)(
    'refuses %s committed after active-user preflight',
    async change => {
      const user = await createTestUser()
      await createTestMembership({ user_id: user.id, plan: 'plus' })
      const slug = `lifecycle-${crypto.randomUUID()}`
      const race =
        change === 'suspension'
          ? withConcurrentActorSuspensionForTest
          : withConcurrentActorDeletionForTest
      const idempotencyKey = crypto.randomUUID()
      try {
        const result = await race(user.id, () =>
          callRejectedMcpTool(
            { ...user, membership_plan: 'plus' },
            'create_topic_recommendation',
            {
              idempotency_key: idempotencyKey,
              markdown: 'Refused',
              topic_title: slug,
              topic_slug: slug,
            },
            SCOPES,
          ),
        )
        expect(JSON.parse(result)).toMatchObject({
          error: {
            status: change === 'suspension' ? 403 : 401,
            message: change === 'suspension' ? 'Your account has been suspended' : 'User not found',
            retryable: false,
          },
        })
      } finally {
        expect.soft(await countTestPostsCreatedBy(user.id)).toBe(0)
        expect
          .soft(
            await getContributionAdmissionConsumptionCountForTest(user.id, 'topic_recommendation'),
          )
          .toBe(0)
        expect
          .soft(
            await getContributionAdmissionReservationStateForTest({
              actorId: user.id,
              idempotencyKey,
            }),
          )
          .not.toBe('committed')
      }
    },
  )
})
