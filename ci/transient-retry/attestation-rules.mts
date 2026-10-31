import { isAreaGateJob } from './ci-aggregate-jobs.mts'
import { getGithubActionsStepGroupSlices } from 'vouchington-tooling/transient-retry'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const attestActionPattern = /^##\[group\]Run actions\/attest@[0-9a-f]{40}\b/
const emptyPersistErrorPattern = /##\[error\]Error: Failed to persist attestation:[\t ]*$/
const tlogFetchErrorPattern =
  /^##\[error\]InternalError: error fetching tlog entry( - \(404\) Not Found)?$/
const tlogNotFoundFollowUp = 'Error: (404) Not Found'
const tlogTimeoutFollowUp =
  /^FetchError: network timeout at: https:\/\/rekor\.sigstore\.dev\/api\/v1\/log\/entries\/[0-9a-f]+$/
const logLinePrefixPattern = /^.*?\d{4}-\d{2}-\d{2}T[\d:.]+Z /

type AttestationTarget = {
  workflowName: string
  jobName: string
  publishStepName: string
  attestStepName: string
  image: string
}

const backendApi: AttestationTarget = {
  workflowName: 'Backend',
  jobName: 'publish-backend-images / build',
  publishStepName: 'Publish validated backend images to GHCR',
  attestStepName: 'Attest api image provenance',
  image: 'api',
}

const web: AttestationTarget = {
  workflowName: 'Web',
  jobName: 'publish-web-images / build',
  publishStepName: 'Publish validated web image to GHCR',
  attestStepName: 'Attest web image provenance',
  image: 'web',
}

// The image push succeeded and attestation is the only failed step of the only failed leaf job.
function failedOnlyAtAttestStep(ctx: WorkflowRunContext, target: AttestationTarget) {
  const failedLeafJobs = ctx.failedJobNames.filter(name => !isAreaGateJob(ctx.workflowName, name))
  if (
    ctx.workflowName !== target.workflowName ||
    ctx.conclusion !== 'failure' ||
    failedLeafJobs.length !== 1 ||
    failedLeafJobs[0] !== target.jobName
  )
    return false

  const steps = ctx.jobSteps?.get(target.jobName)
  if (!steps) return false
  if (!steps.some(s => s.name === target.publishStepName && s.conclusion === 'success'))
    return false
  const failedSteps = steps.filter(step =>
    ['failure', 'timed_out', 'cancelled'].includes(step.conclusion ?? ''),
  )
  return (
    failedSteps.length === 1 &&
    failedSteps[0]?.name === target.attestStepName &&
    failedSteps[0]?.conclusion === 'failure'
  )
}

// Attest step groups, as job-log slices, for a digest this job published.
function attestStepLogs(log: string, image: string) {
  const published = [
    ...log.matchAll(
      new RegExp(
        `✓ published ghcr\\.io/vouchington/${image}:[^\\s]+ \\(sha256:([0-9a-f]{64})\\)$`,
        'gm',
      ),
    ),
  ].map(match => match[1])
  const subject = new RegExp(`subject-name: ghcr\\.io/vouchington/${image}\\s*$`, 'm')

  return getGithubActionsStepGroupSlices(log).filter(
    step =>
      attestActionPattern.test(step.header) &&
      subject.test(step.log) &&
      published.includes(step.log.match(/subject-digest: sha256:([0-9a-f]{64})\s*$/m)?.[1] ?? '') &&
      /push-to-registry: true\s*$/m.test(step.log) &&
      step.log.includes('Attestation type: Build Provenance'),
  )
}

async function jobLog(ctx: WorkflowRunContext, jobName: string) {
  return (await ctx.failedJobLogs()).get(jobName) ?? ''
}

export const backendImageAttestationEmptyPersistErrorRule: TransientRetryRule = {
  id: 'backend-image-attestation-empty-persist-error',
  consumerKey: 'publish-backend-api-image-attestation',
  rootCauseKey: 'empty-attestation-persistence-error',
  description:
    'Backend image publication fails only at API provenance attestation with an empty persistence error.',
  rationale:
    'The image was built and pushed before the attestation action emitted its sole error without an underlying diagnostic. This fingerprint affected unrelated merge groups around a successful publish. Retry once; substantive permission, digest, manifest, build, or push errors require investigation.',
  exampleRunIds: ['37654705933', '37641266470'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!failedOnlyAtAttestStep(ctx, backendApi)) return false

    const log = await jobLog(ctx, backendApi.jobName)
    const errorLines = log.split('\n').filter(line => line.includes('##[error]'))
    if (errorLines.length !== 1 || !emptyPersistErrorPattern.test((errorLines[0] ?? '').trim())) {
      return false
    }

    return attestStepLogs(log, backendApi.image).some(step =>
      step.log.includes(errorLines[0] ?? ''),
    )
  },
}

export const webImageAttestationTlogFetchErrorRule: TransientRetryRule = {
  id: 'web-image-attestation-tlog-fetch-error',
  consumerKey: 'publish-web-image-attestation',
  rootCauseKey: 'attestation-tlog-entry-fetch-failure',
  description:
    'Web image publication fails only at provenance attestation while reading back its transparency-log entry.',
  rationale:
    'The image was built and pushed before the attestation action could not read back the Sigstore transparency-log entry it had just created, either with a 404 or a Rekor read timeout. The failure is external and hit unrelated merge groups. Retry once; any other attestation, permission, digest, build, or push error requires investigation.',
  exampleRunIds: ['41130923727', '40997738250'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!failedOnlyAtAttestStep(ctx, web)) return false

    const log = await jobLog(ctx, web.jobName)
    if (log.split('\n').filter(line => line.includes('##[error]')).length !== 1) return false

    return attestStepLogs(log, web.image).some(step => {
      const lines = step.log.split('\n').map(line => line.replace(logLinePrefixPattern, '').trim())
      const errorIndex = lines.findIndex(line => line.startsWith('##[error]'))
      const match = tlogFetchErrorPattern.exec(lines[errorIndex] ?? '')
      if (!match) return false

      const followUp = lines[errorIndex + 1] ?? ''
      const followUpMatches =
        match[1] === undefined
          ? tlogTimeoutFollowUp.test(followUp)
          : followUp === tlogNotFoundFollowUp
      // After the follow-up only the next step group's truncated line prefix may remain.
      return followUpMatches && lines.slice(errorIndex + 2).every(line => line === '')
    })
  },
}
