import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestTopic,
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { createTopicAliases, createUnlinkedTopicAlias } from '@services/topics/aliases'
import '../index.mts'

describe('topic alias mutation suspension guard', () => {
  it.each(['create', 'link', 'unlink'] as const)(
    'rejects a suspended administrator trying to %s aliases',
    async action => {
      const administrator = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: administrator })
      const suffix = createRandomString(12).toLowerCase()
      const alias =
        action === 'unlink'
          ? (await createTopicAliases(topic.id, `suspended-unlink-${suffix}`))[0]!
          : await createUnlinkedTopicAlias(`suspended-link-${suffix}`)
      await suspendTestUser(administrator.id)
      const request = createRequest()
      await request.authenticateAs(administrator)

      const response =
        action === 'create'
          ? await request
              .post(`/api/v1/topics/${topic.id}/aliases`)
              .send({ aliases: `suspended-create-${suffix}` })
              .expect(403)
          : await request[action === 'link' ? 'post' : 'delete'](
              `/api/v1/topics/${topic.id}/aliases/${alias.id}`,
            ).expect(403)

      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      await unsuspendTestUser(administrator.id)
    },
  )
})
