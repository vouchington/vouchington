import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import {
  createTestUser,
  getLatestEmailAddressLoginTokenHash,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import { emails } from '@queues/emails/queues'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { getPrimaryEmailAddress } from '@services/my/email-addresses'

describe('MFA re-auth email admission', () => {
  installEmailDomainDnsMock()
  it('sends re-auth email and returns email_address', async () => {
    const reAuthUser = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(reAuthUser)

    const emailAddress = await getPrimaryEmailAddress(reAuthUser.id)
    const gate = holdQueueAdmission(
      emails,
      'processSendEmailAddressLoginToken',
      data =>
        typeof data === 'object' &&
        data !== null &&
        'input' in data &&
        typeof data.input === 'object' &&
        data.input !== null &&
        'emailAddress' in data.input &&
        data.input.emailAddress === emailAddress,
    )
    let settled = false
    const response = Promise.resolve(
      req.post('/api/v1/auth/mfa/re-auth/email/tokens').expect(200),
    ).then(result => {
      settled = true
      return result
    })
    void response.catch(() => undefined)
    try {
      await gate.entered
      expect(await getLatestEmailAddressLoginTokenHash(emailAddress!)).not.toBeNull()
      expect(settled).toBe(false)
      gate.release()
      expect((await response).body.email_address).toBe(emailAddress)
      const job = await readEnqueuedJob(emails, await gate.admitted)
      expect(job.data).toMatchObject({
        input: { emailAddress },
        variables: { token: expect.any(String) },
      })
    } finally {
      gate.release()
      await response.catch(() => undefined)
      await (await gate.admitted.catch(() => null))?.remove()
      gate.restore()
    }
  })
})
