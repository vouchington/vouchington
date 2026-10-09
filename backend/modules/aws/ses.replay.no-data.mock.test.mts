import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRecordedResponse } from '@voucha/test-helpers/provider-replay'
import { sendEmail } from './ses.mts'

// The recorded SES responses are served through the real SES client's `requestHandler`, so the SDK
// serializes, signs and parses actual wire bytes. The live counterpart is the non-gating smoke
// check in ./ses.generated.test.mts.
const replay = await vi.hoisted(async () => {
  const { createProviderReplay } = await import('@voucha/test-helpers/provider-replay')
  return createProviderReplay()
})

vi.mock<typeof import('@aws-sdk/client-ses')>(
  import('@aws-sdk/client-ses'),
  async importOriginal => {
    const actual = await importOriginal()
    const { replayAwsClient } = await import('@voucha/test-helpers/aws-replay-request-handler')
    return { ...actual, SESClient: replayAwsClient(actual.SESClient, replay) }
  },
)

// oxlint-disable-next-line unicorn/text-encoding-identifier-case -- The SES wire charset label is `UTF-8`.
const WIRE_CHARSET = 'UTF-8'

/** SES speaks the AWS Query protocol: the request body is a form, not JSON. */
function sentForm(index = 0): Record<string, string> {
  const body = replay.requests[index]?.body
  return Object.fromEntries(new URLSearchParams(body?.toString('utf8')))
}

describe('sendEmail against recorded SES responses', () => {
  beforeEach(() => {
    // Without SES credentials the vitest placeholder short-circuits and nothing reaches the SDK.
    vi.stubEnv('SES_AWS_ACCESS_KEY_ID', 'AKIATESTFAKEKEYID000')
    vi.stubEnv('SES_AWS_SECRET_ACCESS_KEY', 'fakeSecretKeyForTestingPurposesOnly00000')
    vi.stubEnv('SES_BCC_EMAIL', 'tests+bcc@voucha.ai')
    vi.stubEnv('SES_SOURCE_EMAIL', '')
    replay.reset()
    return () => vi.unstubAllEnvs()
  })

  it('sends one SendEmail request that carries our destination, BCC, sender and content', async () => {
    replay.respondWith(loadRecordedResponse('aws/ses-send-email-ok.http'))

    const result = await sendEmail({
      to: 'success@simulator.amazonses.com',
      subject: 'Replay subject',
      text: 'Replay text',
      html: '<p>Replay html</p>',
      source: 'tests+sender@voucha.ai',
      replyToAddress: 'tests+reply@voucha.ai',
      configurationSetName: 'replay-config-set',
    })

    expect(result.MessageId).toBe('0100019a-1b2c-3d4e-5f60-7a8b9c0d1e2f-000000')
    expect(replay.requests).toHaveLength(1)
    expect(replay.requests[0]).toMatchObject({ method: 'POST' })
    expect(sentForm()).toMatchObject({
      Action: 'SendEmail',
      Source: 'tests+sender@voucha.ai',
      'Destination.ToAddresses.member.1': 'success@simulator.amazonses.com',
      'Destination.BccAddresses.member.1': 'tests+bcc@voucha.ai',
      'ReplyToAddresses.member.1': 'tests+reply@voucha.ai',
      ConfigurationSetName: 'replay-config-set',
      'Message.Subject.Data': 'Replay subject',
      'Message.Subject.Charset': WIRE_CHARSET,
      'Message.Body.Text.Data': 'Replay text',
      'Message.Body.Text.Charset': WIRE_CHARSET,
      'Message.Body.Html.Data': '<p>Replay html</p>',
      'Message.Body.Html.Charset': WIRE_CHARSET,
    })
    replay.assertDrained()
  })

  it('uses the default sender and reply-to, and sends only the body parts it was given', async () => {
    replay.respondWith(loadRecordedResponse('aws/ses-send-email-ok.http'))

    await sendEmail({ to: 'success@simulator.amazonses.com', subject: 'Defaults', text: 'Text' })

    const form = sentForm()
    expect(form).toMatchObject({
      Source: 'no-reply@voucha.ai',
      'ReplyToAddresses.member.1': 'support@voucha.ai',
      'Message.Body.Text.Data': 'Text',
    })
    expect(form).not.toHaveProperty(['Message.Body.Html.Data'])
    expect(form).not.toHaveProperty(['ConfigurationSetName'])
    replay.assertDrained()
  })

  it('omits the global BCC only when the caller opts out of it', async () => {
    replay.respondWith(loadRecordedResponse('aws/ses-send-email-ok.http'))

    await sendEmail({
      to: ['a@simulator.amazonses.com', 'b@simulator.amazonses.com'],
      subject: 'No BCC',
      text: 'Text',
      allowGlobalBcc: false,
    })

    const form = sentForm()
    expect(form).toMatchObject({
      'Destination.ToAddresses.member.1': 'a@simulator.amazonses.com',
      'Destination.ToAddresses.member.2': 'b@simulator.amazonses.com',
    })
    expect(
      Object.keys(form).filter(name => name.startsWith('Destination.BccAddresses.member')),
    ).toEqual([])
    replay.assertDrained()
  })

  it('sends custom headers as a SendRawEmail request whose destinations include the BCC', async () => {
    replay.respondWith(loadRecordedResponse('aws/ses-send-raw-email-ok.http'))

    const result = await sendEmail({
      to: 'success@simulator.amazonses.com',
      subject: 'Raw subject',
      text: 'Raw text',
      source: 'tests+sender@voucha.ai',
      configurationSetName: 'replay-config-set',
      headers: { 'List-Unsubscribe': '<https://example.com/unsubscribe?token=replay>' },
    })

    expect(result.MessageId).toBe('0100019a-2c3d-4e5f-6071-8b9c0d1e2f30-000000')
    const form = sentForm()
    expect(form).toMatchObject({
      Action: 'SendRawEmail',
      Source: 'tests+sender@voucha.ai',
      'Destinations.member.1': 'success@simulator.amazonses.com',
      'Destinations.member.2': 'tests+bcc@voucha.ai',
      ConfigurationSetName: 'replay-config-set',
    })
    const raw = Buffer.from(form['RawMessage.Data'] ?? '', 'base64').toString('utf8')
    expect(raw).toContain(
      '\r\nList-Unsubscribe: <https://example.com/unsubscribe?token=replay>\r\n',
    )
    replay.assertDrained()
  })

  it('does not retry a send the provider failed, because a retry could deliver the email twice', async () => {
    replay.respondWith(loadRecordedResponse('aws/ses-send-email-service-unavailable-503.http'))

    await expect(
      sendEmail({ to: 'success@simulator.amazonses.com', subject: 'Once', text: 'Text' }),
    ).rejects.toMatchObject({ name: 'ServiceUnavailable' })

    // The SDK would retry a 503 by default; SES sends have no idempotency token, so we ask for one
    // attempt and the replay is never asked for a second response.
    expect(replay.requests).toHaveLength(1)
    replay.assertDrained()
  })
})
