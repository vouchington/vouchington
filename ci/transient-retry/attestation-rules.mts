import { isAreaGateJob } from './ci-aggregate-jobs.mts'
import { getGithubActionsStepGroupSlices } from './github-actions-log.mts'
import type { TransientRetryRule } from './types.mts'

const publishJobName = 'publish-backend-images / build'
const attestStepName = 'Attest api image provenance'
const attestActionPattern = /^##\[group\]Run actions\/attest@[0-9a-f]{40}\b/
const emptyPersistErrorPattern = /##\[error\]Error: Failed to persist attestation:[\t ]*$/

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
    const failedLeafJobs = ctx.failedJobNames.filter(name => !isAreaGateJob(ctx.workflowName, name))
    if (
      ctx.workflowName !== 'Backend' ||
      ctx.conclusion !== 'failure' ||
      failedLeafJobs.length !== 1 ||
      failedLeafJobs[0] !== publishJobName
    )
      return false

    const steps = ctx.jobSteps?.get(publishJobName)
    if (!steps) return false
    if (
      !steps.some(
        step =>
          step.name === 'Publish validated backend images to GHCR' && step.conclusion === 'success',
      )
    )
      return false
    const failedSteps = steps.filter(step =>
      ['failure', 'timed_out', 'cancelled'].includes(step.conclusion ?? ''),
    )
    if (
      failedSteps.length !== 1 ||
      failedSteps[0]?.name !== attestStepName ||
      failedSteps[0]?.conclusion !== 'failure'
    )
      return false

    const logs = await ctx.failedJobLogs()
    const log = logs.get(publishJobName) ?? ''
    const errorLines = log.split('\n').filter(line => line.includes('##[error]'))
    if (errorLines.length !== 1 || !emptyPersistErrorPattern.test((errorLines[0] ?? '').trim())) {
      return false
    }

    const publishedApiDigests = [
      ...log.matchAll(/✓ published ghcr\.io\/vouchington\/api:[^\s]+ \(sha256:([0-9a-f]{64})\)$/gm),
    ].map(match => match[1])

    return getGithubActionsStepGroupSlices(log).some(
      step =>
        attestActionPattern.test(step.header) &&
        /subject-name: ghcr\.io\/vouchington\/api\s*$/m.test(step.log) &&
        /subject-digest: sha256:[0-9a-f]{64}\s*$/m.test(step.log) &&
        publishedApiDigests.includes(
          step.log.match(/subject-digest: sha256:([0-9a-f]{64})\s*$/m)?.[1] ?? '',
        ) &&
        /push-to-registry: true\s*$/m.test(step.log) &&
        step.log.includes('Attestation type: Build Provenance') &&
        step.log.includes(errorLines[0] ?? ''),
    )
  },
}
