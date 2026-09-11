import { it, describe } from 'vitest'
import assert from 'node:assert/strict'
import { assertValidSendEmailOptions } from './email.mts'

describe('assertValidSendEmailOptions', () => {
  it('valid options with text', () => {
    assertValidSendEmailOptions({
      to: 'tests@voucha.ai',
      subject: 'Test Subject',
      text: 'Hello',
    })
  })

  it('valid options with html', () => {
    assertValidSendEmailOptions({
      to: 'tests@voucha.ai',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    })
  })

  it('valid options with array of recipients', () => {
    assertValidSendEmailOptions({
      to: ['tests@voucha.ai', 'tests+abc@voucha.ai'],
      subject: 'Test Subject',
      text: 'Hello',
    })
  })

  it('throws 422 when to is missing', () => {
    assert.throws(() => assertValidSendEmailOptions({ to: '', subject: 'Test', text: 'Hello' }), {
      status: 422,
    })
  })

  it('throws 422 when subject is missing', () => {
    assert.throws(
      () => assertValidSendEmailOptions({ to: 'tests@voucha.ai', subject: '', text: 'Hello' }),
      { status: 422 },
    )
  })

  it('throws 422 when neither text nor html is provided', () => {
    assert.throws(() => assertValidSendEmailOptions({ to: 'tests@voucha.ai', subject: 'Test' }), {
      status: 422,
    })
  })

  it('throws 422 for non-test email addresses in test mode', () => {
    assert.throws(
      () =>
        assertValidSendEmailOptions({
          to: 'user@example.org',
          subject: 'Test',
          text: 'Hello',
        }),
      { status: 422 },
    )
  })

  it('allows AWS SES simulator addresses in test mode', () => {
    for (const to of [
      'success@simulator.amazonses.com',
      'bounce@simulator.amazonses.com',
      'complaint@simulator.amazonses.com',
      'suppressionlist@simulator.amazonses.com',
      'ooto@simulator.amazonses.com',
    ]) {
      assertValidSendEmailOptions({ to, subject: 'Test', text: 'Hello' })
    }
  })

  it('rejects custom header values with line breaks', () => {
    assert.throws(
      () =>
        assertValidSendEmailOptions({
          to: 'tests@voucha.ai',
          subject: 'Test',
          text: 'Hello',
          headers: { 'List-Unsubscribe': '<https://voucha.ai>\r\nBcc: tests+attacker@voucha.ai' },
        }),
      { status: 422 },
    )
  })

  it.each(['From', 'To', 'Bcc', 'Reply-To', 'Subject', 'MIME-Version', 'Content-Type'])(
    'rejects a custom %s header that would override MIME metadata',
    header => {
      assert.throws(
        () =>
          assertValidSendEmailOptions({
            to: 'tests@voucha.ai',
            subject: 'Test',
            text: 'Hello',
            headers: { [header]: 'override' },
          }),
        { status: 422 },
      )
    },
  )
})
