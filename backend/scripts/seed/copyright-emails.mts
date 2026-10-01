import { createHash } from 'node:crypto'
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'

const HOUR_MS = 60 * 60 * 1000
const NOTICE_MESSAGE_ID = '<dev-seed-copyright-notice@mail.rights-holder.example>'

type SeedParse = Parameters<typeof recordCopyrightEmailParse>[1]

type SeedEmail = {
  // Stable across runs: the intake insert conflicts on it, so reseeding adds nothing.
  sesMessageId: string
  receivedHoursAgo: number
  // null leaves the intake with no parse row, as when the SES worker never recorded one.
  parse: SeedParse | null
}

function noticeBody(hostedUseUrl: string): string {
  return [
    'To the Voucha designated agent,',
    '',
    `I am the photographer of the harbour sunrise image shown at ${hostedUseUrl}.`,
    'It was published without my permission. Please remove it under 17 U.S.C. 512(c).',
    '',
    'I have a good-faith belief the use is not authorised, and the information in this notice',
    'is accurate. Under penalty of perjury I am the owner of the exclusive right at issue.',
    '',
    'Dana Whitfield, Whitfield Photography',
  ].join('\n')
}

// One per queue state the email-review page branches on: a new notice, a reply that quotes it,
// a parse that failed, and an intake whose parse never landed (so the reply address is typed in).
function seedEmails(hostedUseUrl: string): SeedEmail[] {
  const sender = { fromEmail: 'dana@whitfield-photo.example', fromName: 'Dana Whitfield' }
  return [
    {
      sesMessageId: 'ses-dev-seed-copyright-notice',
      receivedHoursAgo: 3,
      parse: {
        status: 'succeeded',
        ...sender,
        subject: 'DMCA takedown notice: harbour sunrise photograph',
        bodyText: noticeBody(hostedUseUrl),
        messageId: NOTICE_MESSAGE_ID,
        replyReferences: [],
        attachments: [
          {
            filename: 'signed-notice.pdf',
            contentId: null,
            mimeType: 'application/pdf',
            byteSize: 48_213,
            sha256: createHash('sha256').update('dev-seed-signed-notice.pdf').digest(),
          },
        ],
      },
    },
    {
      sesMessageId: 'ses-dev-seed-copyright-thread-reply',
      receivedHoursAgo: 2,
      parse: {
        status: 'succeeded',
        ...sender,
        subject: 'Re: DMCA takedown notice: harbour sunrise photograph',
        bodyText: 'Following up: I can send the original RAW file if that helps verify ownership.',
        messageId: '<dev-seed-copyright-reply@mail.rights-holder.example>',
        replyReferences: [NOTICE_MESSAGE_ID],
        attachments: [],
      },
    },
    {
      sesMessageId: 'ses-dev-seed-copyright-parse-failed',
      receivedHoursAgo: 1.5,
      parse: { status: 'failed', error: 'MIME parse failed: unterminated multipart boundary' },
    },
    { sesMessageId: 'ses-dev-seed-copyright-no-parse', receivedHoursAgo: 0.5, parse: null },
  ]
}

export async function seedCopyrightEmails(hostedUseUrl: string): Promise<string[]> {
  const intakeIds: string[] = []
  for (const email of seedEmails(hostedUseUrl)) {
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId: email.sesMessageId,
      receivedAt: new Date(Date.now() - email.receivedHoursAgo * HOUR_MS),
      rawStorageKey: `dev-seed/${email.sesMessageId}/original.eml`,
      rawSha256: createHash('sha256').update(email.sesMessageId).digest(),
      rawMimeType: 'message/rfc822',
      rawByteSize: 4_096,
    })
    if (email.parse) await recordCopyrightEmailParse(intake, email.parse)
    intakeIds.push(intake.id)
  }
  return intakeIds
}
