import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
  insertTestSupportMessage,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/api/test-helpers/server'
import type { PrivateUser } from '@services/users/types'

describe('support-threads detail pagination', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns the newest messages on the default detail load', async () => {
    const suffix = rand()
    const emailAddress = user.email_address ?? `tests+latest-${suffix}@voucha.ai`
    const contact = await insertTestSupportContact({ emailAddress, userId: user.id })
    const thread = await insertTestSupportThread({
      supportContactId: contact.id,
      subject: `Latest thread ${suffix}`,
    })

    for (let index = 1; index <= 30; index += 1) {
      await insertTestSupportMessage({
        supportThreadId: thread.id,
        bodyText: `Message ${String(index).padStart(2, '0')} ${suffix}`,
      })
    }

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/my/support-threads/${thread.id}`).expect(200)

    expect(response.body.messages).toHaveLength(25)
    expect(response.body.messages[0]).toHaveProperty('body_text', `Message 06 ${suffix}`)
    expect(response.body.messages.at(-1)).toHaveProperty('body_text', `Message 30 ${suffix}`)
    expect(response.body.page_info).toHaveProperty('has_next_page', true)
    expect(response.body.page_info.end_cursor).toBeTruthy()
  })

  it('returns the newest messages when limit is present without after', async () => {
    const suffix = rand()
    const emailAddress = user.email_address ?? `tests+limit-${suffix}@voucha.ai`
    const contact = await insertTestSupportContact({ emailAddress, userId: user.id })
    const thread = await insertTestSupportThread({
      supportContactId: contact.id,
      subject: `Limit thread ${suffix}`,
    })

    for (let index = 1; index <= 30; index += 1) {
      await insertTestSupportMessage({
        supportThreadId: thread.id,
        bodyText: `Limit message ${String(index).padStart(2, '0')} ${suffix}`,
      })
    }

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get(`/api/v1/my/support-threads/${thread.id}?limit=25`)
      .expect(200)

    expect(response.body.messages).toHaveLength(25)
    expect(response.body.messages[0]).toHaveProperty('body_text', `Limit message 06 ${suffix}`)
    expect(response.body.messages.at(-1)).toHaveProperty('body_text', `Limit message 30 ${suffix}`)
    expect(response.body.page_info).toHaveProperty('has_next_page', true)
    expect(response.body.page_info.end_cursor).toBeTruthy()
  })

  it('returns older messages when given the latest-page cursor', async () => {
    const suffix = rand()
    const emailAddress = user.email_address ?? `tests+after-${suffix}@voucha.ai`

    const contact = await insertTestSupportContact({
      emailAddress,
      userId: user.id,
    })
    const thread = await insertTestSupportThread({
      supportContactId: contact.id,
      subject: `Paged thread ${suffix}`,
    })
    for (let index = 1; index <= 5; index += 1) {
      await insertTestSupportMessage({
        supportThreadId: thread.id,
        bodyText: `Paged message ${String(index).padStart(2, '0')} ${suffix}`,
      })
    }

    const request = createRequest()
    await request.authenticateAs(user)
    const latestPage = await request
      .get(`/api/v1/my/support-threads/${thread.id}?limit=2`)
      .expect(200)
    const after = latestPage.body.page_info.end_cursor
    const olderPage = await request
      .get(`/api/v1/my/support-threads/${thread.id}?limit=2&after=${encodeURIComponent(after)}`)
      .expect(200)

    expect(
      latestPage.body.messages.map((message: { body_text: string }) => message.body_text),
    ).toEqual([`Paged message 04 ${suffix}`, `Paged message 05 ${suffix}`])
    expect(latestPage.body.page_info).toHaveProperty('has_next_page', true)
    expect(
      olderPage.body.messages.map((message: { body_text: string }) => message.body_text),
    ).toEqual([`Paged message 02 ${suffix}`, `Paged message 03 ${suffix}`])
    expect(olderPage.body.page_info).toHaveProperty('has_next_page', true)
    expect(olderPage.body.page_info.end_cursor).toBeTruthy()
  })
})
