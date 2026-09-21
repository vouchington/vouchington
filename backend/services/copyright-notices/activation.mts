import assert from 'http-assert'
import { isEmailAddress } from '@ts-shared/utils/validation-core'

export function isCopyrightIntakeEnabled(): boolean {
  return process.env.COPYRIGHT_INTAKE_ENABLED?.trim().toLowerCase() === 'true'
}

export function assertCopyrightIntakeEnabled(): void {
  assert(isCopyrightIntakeEnabled(), 503, 'Copyright intake is not available')
  assert(
    process.env.S3_BUCKET_COPYRIGHT_EVIDENCE?.trim(),
    503,
    'Copyright evidence storage is not configured',
  )
  assert(
    process.env.SES_COPYRIGHT_SOURCE_EMAIL &&
      isEmailAddress(process.env.SES_COPYRIGHT_SOURCE_EMAIL),
    503,
    'Copyright sender email is not configured',
  )
  assert(
    process.env.SES_COPYRIGHT_REPLY_TO && isEmailAddress(process.env.SES_COPYRIGHT_REPLY_TO),
    503,
    'Copyright designated-agent reply email is not configured',
  )
}
