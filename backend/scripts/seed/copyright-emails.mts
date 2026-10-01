import { createHash } from 'node:crypto'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
  type CopyrightEmailSesVerdicts,
} from '@services/copyright-notices'

const HOUR_MS = 60 * 60 * 1000
const NOTICE_MESSAGE_ID = '<dev-seed-copyright-notice@mail.rights-holder.example>'

type SeedParse = Parameters<typeof recordCopyrightEmailParse>[1]

const PASSING_SES_VERDICTS: CopyrightEmailSesVerdicts = {
  spf: 'pass',
  dkim: 'pass',
  dmarc: 'pass',
  spam: 'pass',
  virus: 'pass',
}

type SeedEmail = {
  // Stable across runs: the intake insert conflicts on it, so reseeding adds nothing.
  sesMessageId: string
  receivedHoursAgo: number
  sesVerdicts: CopyrightEmailSesVerdicts
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
// a parse that failed, an intake whose parse never landed (so the reply address is typed in), and
// a message SES flagged for malware (parsed text only; the original email is withheld).
function seedEmails(hostedUseUrl: string): SeedEmail[] {
  const sender = { fromEmail: 'dana@whitfield-photo.example', fromName: 'Dana Whitfield' }
  return [
    {
      sesMessageId: 'ses-dev-seed-copyright-notice',
      receivedHoursAgo: 3,
      sesVerdicts: PASSING_SES_VERDICTS,
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
      sesVerdicts: PASSING_SES_VERDICTS,
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
      sesVerdicts: PASSING_SES_VERDICTS,
      parse: { status: 'failed', error: 'MIME parse failed: unterminated multipart boundary' },
    },
    {
      sesMessageId: 'ses-dev-seed-copyright-no-parse',
      receivedHoursAgo: 0.5,
      sesVerdicts: PASSING_SES_VERDICTS,
      parse: null,
    },
    {
      // SES's malware scan failed, so the review page withholds the original and shows parsed text.
      sesMessageId: 'ses-dev-seed-copyright-quarantined',
      receivedHoursAgo: 0.25,
      sesVerdicts: { ...PASSING_SES_VERDICTS, virus: 'fail' },
      parse: {
        status: 'succeeded',
        fromEmail: 'claims@mail.rights-holder.example',
        fromName: 'Rights Holder Claims Desk',
        subject: 'Copyright notice with evidence bundle: harbour sunrise photograph',
        bodyText: [
          'To the Voucha designated agent,',
          '',
          `We represent the photographer of the image hosted at ${hostedUseUrl}.`,
          'The evidence bundle with the original file and licence history is attached.',
        ].join('\n'),
        messageId: '<dev-seed-copyright-quarantined@mail.rights-holder.example>',
        replyReferences: [],
        attachments: [
          {
            filename: 'evidence-bundle.zip',
            contentId: null,
            mimeType: 'application/zip',
            byteSize: 1_204_551,
            sha256: createHash('sha256').update('dev-seed-evidence-bundle.zip').digest(),
          },
        ],
      },
    },
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
      sesVerdicts: email.sesVerdicts,
    })
    if (email.parse) await recordCopyrightEmailParse(intake, email.parse)
    intakeIds.push(intake.id)
  }
  return intakeIds
}
