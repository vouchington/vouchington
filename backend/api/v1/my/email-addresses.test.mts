import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getLatestEmailAddressLoginTokenHash,
  readEnqueuedJob,
  updateTestUserUiLocale,
} from '@voucha/test-helpers'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { emails } from '@queues/emails/queues'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'

const newAddress = () => `tests+test-${Math.random().toString(36).slice(2, 10)}@voucha.ai`

describe('email address list and verification request', () => {
  installEmailDomainDnsMock()

  it('returns an empty page with null cursors after the last address', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const first = await request.get('/api/v1/my/email-addresses?limit=1').expect(200)
    expect(first.body.results).toHaveLength(1)
    const cursor = first.body.page_info.start_cursor as string

    const next = await request
      .get('/api/v1/my/email-addresses')
      .query({ after: cursor })
      .expect(200)
    expect(next.body.results).toEqual([])
    expect(next.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('requests verification without a UI locale after token commit and email admission', async () => {
    const user = await createTestUser()
    await updateTestUserUiLocale(user.id, null)
    const address = newAddress()
    const request = createRequest()
    await request.authenticateAs(user)

    const gate = holdQueueAdmission(
      emails,
      'processSendEmailVerificationToken',
      data =>
        typeof data === 'object' &&
        data !== null &&
        'input' in data &&
        typeof data.input === 'object' &&
        data.input !== null &&
        'emailAddress' in data.input &&
        data.input.emailAddress === address,
    )
    let entered = false
    let settled = false
    const responsePromise = Promise.resolve(
      request.post('/api/v1/my/email-addresses').send({ email_address: address }).expect(200),
    ).then(response => {
      settled = true
      return response
    })
    void responsePromise.catch(() => undefined)

    try {
      await gate.entered
      entered = true
      expect(await getLatestEmailAddressLoginTokenHash(address)).not.toBeNull()
      expect(settled).toBe(false)
      gate.release()
      const response = await responsePromise
      expect(response.body.email_address).toBe(address)
      const job = await readEnqueuedJob(emails, await gate.admitted)
      expect(job.data).toMatchObject({
        input: { emailAddress: address },
        variables: { token: expect.any(String), uiLocale: null },
      })
    } finally {
      gate.release()
      await responsePromise.catch(() => undefined)
      if (entered) {
        const admitted = await gate.admitted.catch(() => null)
        await admitted?.remove()
      }
      gate.restore()
    }
  })

  it('keeps a committed verification token successful when queue admission rejects', async () => {
    const user = await createTestUser()
    const address = newAddress()
    const request = createRequest()
    await request.authenticateAs(user)
    const failure = new Error('Owned email verification admission failure')
    const originalAdd = emails.add
    const spy = vi.spyOn(emails, 'add').mockImplementation((name, data, options) => {
      if (
        name === 'processSendEmailVerificationToken' &&
        typeof data === 'object' &&
        data !== null &&
        'input' in data &&
        typeof data.input === 'object' &&
        data.input !== null &&
        'emailAddress' in data.input &&
        data.input.emailAddress === address
      )
        return Promise.reject(failure)
      return originalAdd.call(emails, name, data, options)
    })
    try {
      const response = await request
        .post('/api/v1/my/email-addresses')
        .send({ email_address: address })
        .expect(200)
      expect(response.body.email_address).toBe(address)
      expect(await getLatestEmailAddressLoginTokenHash(address)).not.toBeNull()
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
      ).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('keeps the existing-address error for the current user', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({ email_address: user.email_address })
      .expect(422)

    expect(response.body.message).toBe('Email address already added to your account')
  })

  it('keeps the in-use error for another user address', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({ email_address: otherUser.email_address })
      .expect(422)

    expect(response.body.message).toBe('Email address is already in use')
  })

  it('checks email availability with one annotated query', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubEnv('VITEST_DIAGNOSTICS', '1')

    try {
      const user = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .post('/api/v1/my/email-addresses')
        .send({ email_address: newAddress() })
        .expect(200)

      const profileLines = stderr.mock.calls
        .map(([chunk]) => String(chunk))
        .filter(line => line.includes('route=POST /api/v1/my/email-addresses '))
      expect(profileLines).toHaveLength(1)
      expect(profileLines[0]).not.toContain('assertEmailAddressAvailableForUser')
    } finally {
      stderr.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
