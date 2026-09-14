import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createRandomEmailAddress,
  createRandomPhoneNumber,
  createTestUserDirect,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import { getUserTagTopics } from '@services/topics/user-tag-topics'

describe('user-tag GET identifiers', () => {
  it('canonicalizes a username before loading user tags', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUserDirect()
    const [tag] = await getUserTagTopics()
    const request = createRequest()
    await request.authenticateAs(voter)
    await request
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)

    const response = await request
      .get(`/api/v1/entity-relations/user/${target.username}/category/topic`)
      .expect(200)

    expect(response.body.entity_relations).toEqual(
      expect.objectContaining({
        [response.body.results[0].id]: expect.objectContaining({ subject_id: target.id }),
      }),
    )
  })

  it('rejects registered and unregistered contacts plus malformed identifiers with 422', async () => {
    const viewer = await createTestUserDirect()
    const target = await createTestUserDirect({ withEmail: true, phone_number: true })
    const request = createRequest()
    await request.authenticateAs(viewer)

    for (const identifier of [
      target.email_address!,
      createRandomEmailAddress(),
      target.phone_number!,
      createRandomPhoneNumber(),
      'not a valid username',
    ]) {
      await request
        .get(`/api/v1/entity-relations/user/${encodeURIComponent(identifier)}/category/topic`)
        .expect(422)
    }
  })
})
