import assert from 'http-assert'
import { assertMediaDeliveryLegalEnforcementEnabled } from '@modules/aws'
import { isEmailAddress } from '@ts-shared/utils/validation-core'

export function isCopyrightIntakeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COPYRIGHT_INTAKE_ENABLED?.trim().toLowerCase() === 'true'
}

export function assertCopyrightIntakeEnabled(env: NodeJS.ProcessEnv = process.env): void {
  assert(isCopyrightIntakeEnabled(env), 503, 'Copyright intake is not available')
  assert(
    env.S3_BUCKET_COPYRIGHT_EVIDENCE?.trim(),
    503,
    'Copyright evidence storage is not configured',
  )
  assert(
    env.SES_COPYRIGHT_SOURCE_EMAIL && isEmailAddress(env.SES_COPYRIGHT_SOURCE_EMAIL),
    503,
    'Copyright sender email is not configured',
  )
  assert(
    env.SES_COPYRIGHT_REPLY_TO && isEmailAddress(env.SES_COPYRIGHT_REPLY_TO),
    503,
    'Copyright designated-agent reply email is not configured',
  )
  try {
    assertMediaDeliveryLegalEnforcementEnabled(env)
  } catch {
    assert(false, 503, 'Copyright media delivery enforcement is not configured')
  }
}
