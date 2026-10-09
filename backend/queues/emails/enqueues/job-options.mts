import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT } from '../config.mts'
import type { EmailJobs, EmailSendJobs } from '../types.mts'

/**
 * Template emails whose payload carries a credential the recipient redeems: a login token, an
 * email verification code, a community invite code, or a presigned account-data download URL.
 * The login token is stored hashed, so the raw value can only travel in the payload. These jobs are
 * not retained once they finish. Under the default 100-deep retention the raw credential would sit
 * in Valkey, readable by anything with queue access, until 100 newer jobs finished.
 *
 * Failure reporting is unchanged: the worker reports a terminal failure from its in-process
 * `failed` event, which fires with the job in hand, and `scrubJobData` redacts the credential from
 * that report (the dev-only verbose worker logger prints raw job data on a developer machine).
 * Retries still need the payload, so the credential stays in Valkey while a job is waiting,
 * active, or backing off. A job that stalls past its limit is also not removed by
 * `removeOnFail: true`.
 */
export const SECRET_BEARING_EMAIL_JOBS = [
  'processSendEmailAddressLoginToken',
  'processSendEmailVerificationToken',
  'processSendCommunityInviteEmail',
  'processSendDataExportReadyEmail',
] as const satisfies readonly EmailSendJobs[]

export function getEmailSendJobOptions(
  jobName: EmailJobs,
  priority: number = PRIORITY_DEFAULT,
): Partial<JobOptions> {
  const isSecretBearing = (SECRET_BEARING_EMAIL_JOBS as readonly EmailJobs[]).includes(jobName)
  return isSecretBearing ? { priority, removeOnComplete: true, removeOnFail: true } : { priority }
}
