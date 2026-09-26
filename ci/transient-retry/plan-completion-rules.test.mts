import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'

import { RULES, type WorkflowRunContext } from './rules.mts'

const auditJobName = 'audit'
const ruleId = 'plan-completion-setup-node-tool-cache-timeout'
const setupNodeSha = '820762786026740c76f36085b0efc47a31fe5020'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

function setupNodeLine(message: string): string {
  return `audit\tRun actions/setup-node@${setupNodeSha}\t${message}`
}

// Trimmed from Plan completion advisory run 36261771483. Node was downloaded and
// extracted; the step then stalled on the GitHub-hosted tool cache until the
// one-minute action timeout.
const toolCacheTimeoutLog = [
  setupNodeLine(`##[group]Run actions/setup-node@${setupNodeSha}`),
  setupNodeLine('with:'),
  setupNodeLine('  node-version-file: .nvmrc'),
  setupNodeLine('  package-manager-cache: false'),
  setupNodeLine('Resolved .nvmrc as 26'),
  setupNodeLine('Attempting to download 26...'),
  setupNodeLine(
    'Acquiring 26.10.0 - x64 from https://github.com/actions/node-versions/releases/download/26.10.0-35737674515/node-26.10.0-linux-x64.tar.gz',
  ),
  setupNodeLine('Extracting ...'),
  setupNodeLine('Adding to the cache ...'),
  setupNodeLine(
    `##[error]The action 'Run actions/setup-node@${setupNodeSha}' has timed out after 1 minutes.`,
  ),
].join('\n')

function auditContext(log: string, overrides: Partial<WorkflowRunContext> = {}) {
  return makeCtx({
    workflowName: 'Plan completion advisory',
    failedJobNames: [auditJobName],
    failedJobLogs: () => Promise.resolve(new Map([[auditJobName, log]])),
    ...overrides,
  })
}

describe('Plan completion advisory setup-node tool-cache timeout', () => {
  it('reruns the observed tool-cache timeout once', async () => {
    const result = await decide(auditContext(toolCacheTimeoutLog), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe(ruleId)
  })

  it('does not match the same log on a different workflow', async () => {
    const result = await decide(auditContext(toolCacheTimeoutLog, { workflowName: 'CI' }), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another job failed', async () => {
    const result = await decide(
      auditContext(toolCacheTimeoutLog, { failedJobNames: [auditJobName, 'publish'] }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a cancelled run', async () => {
    const result = await decide(
      auditContext(toolCacheTimeoutLog, { conclusion: 'cancelled' }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match an audit-script failure after setup-node cached Node', async () => {
    const log = [
      setupNodeLine(`##[group]Run actions/setup-node@${setupNodeSha}`),
      setupNodeLine(
        'Acquiring 26.10.0 - x64 from https://github.com/actions/node-versions/releases/download/26.10.0-35737674515/node-26.10.0-linux-x64.tar.gz',
      ),
      setupNodeLine('Adding to the cache ...'),
      'audit\tAudit open Plans\t##[group]Run node ci/plan-completion.mts',
      'audit\tAudit open Plans\t##[error]Process completed with exit code 1.',
    ].join('\n')
    const result = await decide(auditContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a setup-node timeout before the tool-cache add', async () => {
    const log = [
      setupNodeLine(`##[group]Run actions/setup-node@${setupNodeSha}`),
      setupNodeLine('Resolved .nvmrc as 26'),
      setupNodeLine('Attempting to download 26...'),
      setupNodeLine(
        `##[error]The action 'Run actions/setup-node@${setupNodeSha}' has timed out after 1 minutes.`,
      ),
    ].join('\n')
    const result = await decide(auditContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a setup-node executable failure', async () => {
    const log = [
      setupNodeLine(`##[group]Run actions/setup-node@${setupNodeSha}`),
      setupNodeLine('##[error]Unable to locate executable file: node'),
      setupNodeLine('##[error]Process completed with exit code 1.'),
    ].join('\n')
    const result = await decide(auditContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a tool-cache timeout mixed with another setup-node error', async () => {
    const log = [
      setupNodeLine(`##[group]Run actions/setup-node@${setupNodeSha}`),
      setupNodeLine(
        'Acquiring 26.10.0 - x64 from https://github.com/actions/node-versions/releases/download/26.10.0-35737674515/node-26.10.0-linux-x64.tar.gz',
      ),
      setupNodeLine('Adding to the cache ...'),
      setupNodeLine('##[error]Unexpected error while extracting node'),
      setupNodeLine(
        `##[error]The action 'Run actions/setup-node@${setupNodeSha}' has timed out after 1 minutes.`,
      ),
    ].join('\n')
    const result = await decide(auditContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after this rule has already rerun once', async () => {
    const result = await decide(
      auditContext(toolCacheTimeoutLog, {
        runAttempt: 2,
        ruleAttempts: new Map([[ruleId, 2]]),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
