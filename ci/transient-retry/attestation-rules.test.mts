import { describe, expect, it } from 'vitest'

import { makeCtx } from '../test-helpers/transient-retry/helpers.mts'
import { evaluateWorkflow as decide } from './decide.mts'
import { rules, type WorkflowRunContext } from './rules.mts'

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
    const result = await decide(context(), rules)
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
    expect(await decide(context(log), rules)).toMatchObject({
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
    { runAttempt: 2, retryAttempts: new Map([[ruleId, 2]]) },
  ])('rejects missing, mixed, or exhausted run evidence %#', async overrides => {
    expect(await decide(context(observedLog, overrides), rules)).toMatchObject({
      decision: 'dispatch',
      matchedRule: '',
    })
  })
})

const webJob = 'publish-web-images / build'
const webStep = 'Attest web image provenance'
const webRuleId = 'web-image-attestation-tlog-fetch-error'
const rekorUrl = `https://rekor.sigstore.dev/api/v1/log/entries/${'a'.repeat(80)}`

function webLog(errorLines: string[]) {
  return [
    `✓ published ghcr.io/vouchington/web:sha-${actionRef} (sha256:${digest})`,
    `##[group]Run actions/attest@${actionRef}`,
    'with:',
    '  subject-name: ghcr.io/vouchington/web',
    `  subject-digest: sha256:${digest}`,
    '  push-to-registry: true',
    '##[endgroup]',
    'Attestation type: Build Provenance',
    ...errorLines,
    '##[group]Run docker logout ghcr.io >/dev/null 2>&1 || true',
  ]
    .map(line => `${webJob}\tUNKNOWN STEP\t2026-10-30T21:33:39.8665731Z ${line}`)
    .join('\n')
}

// Trimmed from run 41130923727/job 124322394632 and run 40997738250/job 123875790843. Refs and
// digest are synthetic; the action inputs and the terminal error plus follow-up lines are observed.
const notFoundErrors = [
  '##[error]InternalError: error fetching tlog entry - (404) Not Found',
  'Error: (404) Not Found',
]
const timeoutErrors = [
  '##[error]InternalError: error fetching tlog entry',
  `FetchError: network timeout at: ${rekorUrl}`,
]

function webContext(log: string, overrides: Partial<WorkflowRunContext> = {}) {
  return makeCtx({
    workflowName: 'Web',
    failedJobNames: [webJob, 'web'],
    jobSteps: new Map([
      [
        webJob,
        [
          { name: 'Publish validated web image to GHCR', conclusion: 'success' },
          { name: webStep, conclusion: 'failure' },
        ],
      ],
    ]),
    failedJobLogs: () => Promise.resolve(new Map([[webJob, log]])),
    ...overrides,
  })
}

describe('Web image attestation transparency-log fetch failure', () => {
  it.each([
    ['404', notFoundErrors],
    ['Rekor timeout', timeoutErrors],
  ])('reruns the observed %s variant once', async (_name, errors) => {
    expect(await decide(webContext(webLog(errors)), rules)).toMatchObject({
      decision: 'rerun',
      matchedRule: webRuleId,
    })
  })

  const notFound = webLog(notFoundErrors)
  const timeout = webLog(timeoutErrors)

  it.each([
    ['missing publication', notFound.replace('✓ published', 'published')],
    [
      'different published digest',
      notFound.replace(`(sha256:${digest})`, `(sha256:${'2'.repeat(64)})`),
    ],
    [
      'different subject',
      notFound.replace(
        'subject-name: ghcr.io/vouchington/web',
        'subject-name: ghcr.io/vouchington/api',
      ),
    ],
    ['no registry push', notFound.replace('push-to-registry: true', 'push-to-registry: false')],
    ['missing provenance', notFound.replace('Attestation type: Build Provenance', '')],
    ['permission error', webLog(['##[error]InternalError: permission denied'])],
    ['other attestation error', webLog(['##[error]Error: Failed to persist attestation: '])],
    ['404 without follow-up', webLog(notFoundErrors.slice(0, 1))],
    ['404 with timeout follow-up', webLog([notFoundErrors[0] ?? '', timeoutErrors[1] ?? ''])],
    ['timeout with 404 follow-up', webLog([timeoutErrors[0] ?? '', notFoundErrors[1] ?? ''])],
    ['timeout from another host', timeout.replace('rekor.sigstore.dev', 'example.com')],
    ['extra error line', webLog([...notFoundErrors, '##[error]denied: permission denied'])],
    ['extra output after follow-up', webLog([...notFoundErrors, 'unexpected failure detail'])],
    [
      'error in another step',
      notFound.replace('Attestation type', '##[group]Run other/action\nAttestation type'),
    ],
    ['404 text outside the attest step', webLog(['##[group]Run other/action', ...notFoundErrors])],
  ])('rejects %s', async (_name, log) => {
    expect(await decide(webContext(log), rules)).toMatchObject({
      decision: 'dispatch',
      matchedRule: '',
    })
  })

  it.each<Partial<WorkflowRunContext>>([
    { workflowName: 'Backend' },
    { conclusion: 'cancelled' },
    { failedJobNames: [webJob, 'web', 'test-web-unit / web-tests (1)'] },
    { failedJobNames: ['other / build'] },
    { jobSteps: undefined },
    { jobSteps: new Map([[webJob, [{ name: webStep, conclusion: 'failure' }]]]) },
    {
      jobSteps: new Map([
        [
          webJob,
          [
            { name: 'Publish validated web image to GHCR', conclusion: 'failure' },
            { name: webStep, conclusion: 'failure' },
          ],
        ],
      ]),
    },
    {
      jobSteps: new Map([
        [
          webJob,
          [
            { name: 'Publish validated web image to GHCR', conclusion: 'success' },
            { name: 'Build', conclusion: 'failure' },
            { name: webStep, conclusion: 'failure' },
          ],
        ],
      ]),
    },
    { runAttempt: 2, retryAttempts: new Map([[webRuleId, 2]]) },
  ])('rejects missing, mixed, or exhausted run evidence %#', async overrides => {
    expect(await decide(webContext(webLog(notFoundErrors), overrides), rules)).toMatchObject({
      decision: 'dispatch',
      matchedRule: '',
    })
  })
})
