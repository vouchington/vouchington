import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const lintLinksJobName = 'lint-links'
const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Lint Links',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [lintLinksJobName],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

const failedJobLogs = (log: string) => () => Promise.resolve(new Map([[lintLinksJobName, log]]))

const setupLycheeCurl6DnsLog = [
  'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
  'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run set -euo pipefail',
  'lint-links\tRun ./.github/actions/setup-lychee\tbash "$GITHUB_WORKSPACE/ci/install-github-release.sh" \\',
  'lint-links\tRun ./.github/actions/setup-lychee\t  --repo lycheeverse/lychee \\',
  'lint-links\tRun ./.github/actions/setup-lychee\tcurl: (6) Could not resolve host: github.com',
  'lint-links\tRun ./.github/actions/setup-lychee\t##[error]Process completed with exit code 6.',
].join('\n')

describe('lint-links-setup-lychee-download-flake github.com DNS', () => {
  it('matches a setup-lychee GitHub DNS failure that exits with curl status 6', async () => {
    const result = await decide(
      makeCtx({ failedJobLogs: failedJobLogs(setupLycheeCurl6DnsLog) }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('lint-links-setup-lychee-download-flake')
  })

  it('does not match a setup-lychee DNS failure for a host other than github.com', async () => {
    const log = setupLycheeCurl6DnsLog.replace(
      'Could not resolve host: github.com',
      'Could not resolve host: github.com.invalid',
    )

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a setup-lychee exit 6 without a github.com DNS failure', async () => {
    const log = setupLycheeCurl6DnsLog.replace(
      'curl: (6) Could not resolve host: github.com',
      'install-github-release.sh: checksum not found for lychee-x86_64-unknown-linux-gnu.tar.gz',
    )

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match an earlier github.com DNS failure once a later setup-lychee error is terminal', async () => {
    const log = [
      setupLycheeCurl6DnsLog,
      'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run echo unsupported',
      'lint-links\tRun ./.github/actions/setup-lychee\tUnsupported platform: Linux-riscv64',
      'lint-links\tRun ./.github/actions/setup-lychee\t##[error]Process completed with exit code 1.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the github.com DNS fingerprint after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({ runAttempt: 2, failedJobLogs: failedJobLogs(setupLycheeCurl6DnsLog) }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
