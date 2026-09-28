import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'

describe('POST /api/v1/blacklist', () => {
  it('enqueues the dispatcher and a source sync', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)

    const dispatch = await request.post('/api/v1/blacklist/dispatch').expect(200)
    expect(dispatch.body).toMatchObject({ success: true })

    const sync = await request
      .post('/api/v1/blacklist/source-sync')
      .send({ sourceId: '1' })
      .expect(200)
    expect(sync.body).toMatchObject({ success: true })
  })
})
