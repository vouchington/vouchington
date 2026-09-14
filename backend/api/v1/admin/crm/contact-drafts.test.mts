import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestCrmContact } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import * as crmOutreach from '@agents/crm-outreach'
import { openAiSpendCapConfig } from '@services/ai-usage'
import type { PrivateUser } from '@services/users/types'
import type { CrmContact } from '@voucha/types/entities/crm-contact'

const draftCrmOutreachEmailSpy = vi.spyOn(crmOutreach, 'draftCrmOutreachEmail').mockResolvedValue({
  subject: 'Collaboration Opportunity',
  body_html: '<p>We would love to work with you!</p>',
  body_text: 'We would love to work with you!',
} as never)

let admin: PrivateUser
let regularUser: PrivateUser
let contact: CrmContact

describe('contact-drafts', () => {
  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    contact = await createTestCrmContact(admin)
    await import('./contact-drafts.mts')
  })

  const FAKE_UUID = '00000000-0000-0000-0000-000000000004'

  describe('POST /api/v1/crm/contacts/:contactId/email-drafts', () => {
    beforeEach(() => {
      draftCrmOutreachEmailSpy.mockClear()
    })

    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.post(`/api/v1/crm/contacts/${contact.id}/email-drafts`).send({}).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.post(`/api/v1/crm/contacts/${contact.id}/email-drafts`).send({}).expect(403)
    })

    it('returns a draft email for a contact', async () => {
      // enabled: false bypasses the real spend-cap DB read (spend-cap-guard.mts's own
      // short-circuit), so this success path can't flake on unrelated ai_usage_records rows from
      // other tests sharing today's UTC window.
      await openAiSpendCapConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
      try {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .post(`/api/v1/crm/contacts/${contact.id}/email-drafts`)
          .send({})
          .expect(200)

        expect(response.body.draft).toHaveProperty('subject')
        expect(response.body.draft).toHaveProperty('body_html')
        expect(response.body.draft).toHaveProperty('body_text')
        expect(response.body.draft.subject).toBe('Collaboration Opportunity')
      } finally {
        restore()
      }
    })

    it('passes prompt and tone to the agent', async () => {
      await openAiSpendCapConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
      try {
        const request = createRequest()
        await request.authenticateAs(admin)
        await request
          .post(`/api/v1/crm/contacts/${contact.id}/email-drafts`)
          .send({ prompt: 'Focus on travel content', tone: 'friendly' })
          .expect(200)

        expect(draftCrmOutreachEmailSpy).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ id: contact.id }),
          expect.objectContaining({ prompt: 'Focus on travel content', tone: 'friendly' }),
        )
      } finally {
        restore()
      }
    })

    it('returns 422 for invalid contact UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/crm/contacts/not-a-uuid/email-drafts').send({}).expect(422)
    })

    it('returns 404 for non-existent contact', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post(`/api/v1/crm/contacts/${FAKE_UUID}/email-drafts`).send({}).expect(404)
    })

    it('returns 415 without JSON content type', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post(`/api/v1/crm/contacts/${contact.id}/email-drafts`)
        .set('Content-Type', 'text/plain')
        .send('prompt=test')
        .expect(415)
    })

    it('returns 429 and does not call the agent when the daily spend cap is breached', async () => {
      await openAiSpendCapConfig.waitForInitialization()
      // 0 is the true kill-switch value (#8773 review round 4): totalMicrounits is never negative,
      // so this breaches on the very first call regardless of what other tests have written today.
      const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
        daily_cap_microunits: 0,
      })
      try {
        const request = createRequest()
        await request.authenticateAs(admin)
        await request.post(`/api/v1/crm/contacts/${contact.id}/email-drafts`).send({}).expect(429)

        expect(draftCrmOutreachEmailSpy).not.toHaveBeenCalled()
      } finally {
        restore()
      }
    })
  })
})
