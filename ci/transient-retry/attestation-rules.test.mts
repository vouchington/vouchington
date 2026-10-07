import { describe, expect, it } from 'vitest'

import { makeCtx } from '../test-helpers/transient-retry/helpers.mts'
import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const jobName = 'publish-backend-images / build'
const stepName = 'Attest api image provenance'
const ruleId = 'backend-image-attestation-empty-persist-error'
const actionRef = '0'.repeat(40)
const digest = '1'.repeat(64)

// Trimmed from run 37654705933/job 112907910549. Refs and digest are synthetic;
// the action inputs, provenance marker, and empty terminal error retain the observed shape.
const observedLog = [
  `✓ published ghcr.io/vouchington/api:sha-${actionRef} (sha256:${digest})`,
  `##[group]Run actions/attest@${actionRef}`,
  'with:',
  '  subject-name: ghcr.io/vouchington/api',
  `  subject-digest: sha256:${digest}`,
  '  push-to-registry: true',
  '##[endgroup]',
  'Attestation type: Build Provenance',
  '##[error]Error: Failed to persist attestation: ',
  '##[group]Run docker logout ghcr.io >/dev/null 2>&1 || true',
]
  .map(line => `${jobName}\tUNKNOWN STEP\t2026-10-07T16:56:05.4369731Z ${line}`)
  .join('\n')

function context(log = observedLog, overrides: Partial<WorkflowRunContext> = {}) {
  return makeCtx({
    workflowName: 'Backend',
    failedJobNames: [jobName, 'backend'],
    jobSteps: new Map([
      [
        jobName,
        [
          { name: 'Run ./.github/actions/build-backend-images', conclusion: 'success' },
          { name: 'Publish validated backend images to GHCR', conclusion: 'success' },
          { name: stepName, conclusion: 'failure' },
        ],
      ],
    ]),
    failedJobLogs: () => Promise.resolve(new Map([[jobName, log]])),
    ...overrides,
  })
}

describe('Backend empty image attestation persistence failure', () => {
  it('reruns the observed failure once', async () => {
    const result = await decide(context(), RULES)
    expect(result).toMatchObject({ decision: 'rerun', matchedRule: ruleId })
  })

  it.each([
    [
      'missing publication',
      observedLog.replace(
        `✓ published ghcr.io/vouchington/api:sha-${actionRef} (sha256:${digest})`,
        '',
      ),
    ],
    [
      'different published digest',
      observedLog.replace(`(sha256:${digest})`, `(sha256:${'2'.repeat(64)})`),
    ],
    [
      'permission rejection',
      observedLog.replace('persist attestation: ', 'persist attestation: permission denied'),
    ],
    [
      'digest rejection',
      observedLog.replace('persist attestation: ', 'persist attestation: invalid digest'),
    ],
    [
      'bake error',
      `${observedLog}\n##[error]buildx bake failed with: ERROR: target api: failed to solve`,
    ],
    ['push error', `${observedLog}\n##[error]denied: permission denied pushing image`],
    [
      'missing start',
      observedLog.replace(`Run actions/attest@${actionRef}`, 'Run unrelated/action'),
    ],
    ['missing provenance', observedLog.replace('Attestation type: Build Provenance', '')],
    [
      'different subject',
      observedLog.replace('ghcr.io/vouchington/api', 'ghcr.io/vouchington/worker-cpu'),
    ],
    ['no registry push', observedLog.replace('push-to-registry: true', 'push-to-registry: false')],
    ['no empty error', observedLog.replace('##[error]Error: Failed to persist attestation: ', '')],
    [
      'error in another step',
      observedLog.replace('##[error]Error:', '##[group]Run unrelated/action\n##[error]Error:'),
    ],
  ])('rejects %s', async (_name, log) => {
    expect(await decide(context(log), RULES)).toMatchObject({
      decision: 'dispatch',
      matchedRule: '',
    })
  })

  it.each<Partial<WorkflowRunContext>>([
    { workflowName: 'Main CI (backend)' },
    { conclusion: 'cancelled' },
    { failedJobNames: [jobName, 'test-backend-unit / backend-tests (1)'] },
    { failedJobNames: [jobName, 'backend', 'coverage / Patch Coverage'] },
    { failedJobNames: [jobName, 'web'] },
    { failedJobNames: ['other / build'] },
    { jobSteps: undefined },
    { jobSteps: new Map([[jobName, [{ name: stepName, conclusion: 'failure' }]]]) },
    { jobSteps: new Map([[jobName, [{ name: 'Push backend images', conclusion: 'failure' }]]]) },
    {
      jobSteps: new Map([
        [
          jobName,
          [
            { name: stepName, conclusion: 'failure' },
            { name: 'Build', conclusion: 'failure' },
          ],
        ],
      ]),
    },
    { runAttempt: 2, ruleAttempts: new Map([[ruleId, 2]]) },
  ])('rejects missing, mixed, or exhausted run evidence %#', async overrides => {
    expect(await decide(context(observedLog, overrides), RULES)).toMatchObject({
      decision: 'dispatch',
      matchedRule: '',
    })
  })
})
