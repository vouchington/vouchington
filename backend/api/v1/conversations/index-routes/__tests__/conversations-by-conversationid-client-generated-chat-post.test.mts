import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { createConversation } from '@services/conversations-messages/create'

describe('client-generated chat authentication storage failure', () => {
  it('preserves a database authentication error instead of reporting an unauthorized response', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Owned authentication failure')
    const request = createRequest()
    await request.authenticateAs(user)
    const requestId = crypto.randomUUID()
    const url = `/api/v1/conversations/${conversation.id}/client-generated-chat`
    const { result: response, error } = await withPostgresPoolQueryFailureForTest(
      '/* getPrivateUserByAny */',
      async () => {
        await request.post(url).set('x-request-id', crypto.randomUUID()).send({}).expect(422)
        return request.post(url).set('x-request-id', requestId).send({}).expect(500)
      },
      { requestId },
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(response.body).toMatchObject({
      code: '25P02',
      message: error.message,
      request_id: requestId,
    })
    expect(response.body.message).not.toBe('Unauthorized')
    await request.post(url).set('x-request-id', requestId).send({}).expect(422)
  })
})
