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

describe('lint-links-github-5xx', () => {
  const github500Log = [
    '2026-06-21T05:33:49.8304710Z Issues found in 2 inputs. Find details below.',
    '2026-06-21T05:33:49.8317150Z [.github/workflows/COVERAGE.md]:',
    '2026-06-21T05:33:49.8318880Z [500] https://github.com/nalexn/ViewInspector (at 35:62) | Error (cached)',
    '2026-06-21T05:33:49.8323550Z [docs/CLAUDE.md]:',
    '2026-06-21T05:33:49.8330930Z [500] https://github.com/nalexn/ViewInspector (at 44:1) | Rejected status code: 500 Internal Server Error',
    '2026-06-21T05:33:49.8432760Z ##[error]Process completed with exit code 2.',
  ].join('\n')

  it('matches GitHub 500 Lychee failures on attempt 1', async () => {
    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(github500Log) }), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('lint-links-github-5xx')
  })

  it.each([502, 503, 504])('matches GitHub %s Lychee failures', async status => {
    const log = [
      'Issues found in 1 input. Find details below.',
      '[docs/example.md]:',
      `[${status}] https://github.com/example/project (at 1:1) | Rejected status code: ${status}`,
      '##[error]Process completed with exit code 2.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('lint-links-github-5xx')
  })

  it('does not match mixed GitHub 5xx and real broken links', async () => {
    const log = [
      'Issues found in 2 inputs. Find details below.',
      '[docs/example.md]:',
      '[500] https://github.com/example/project (at 1:1) | Rejected status code: 500',
      '[404] https://example.com/missing (at 2:1) | Rejected status code: 404',
      '##[error]Process completed with exit code 2.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match mixed GitHub 5xx and non-status Lychee errors', async () => {
    const log = [
      'Issues found in 2 inputs. Find details below.',
      '[docs/example.md]:',
      '[500] https://github.com/example/project (at 1:1) | Rejected status code: 500',
      '[docs/missing.md]:',
      '[ERR] file:///home/runner/work/filaments/filaments/docs/missing.md | Failed: Cannot find file',
      '##[error]Process completed with exit code 2.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it.each(['ERROR', 'TIMEOUT'])(
    'does not match mixed GitHub 5xx and Lychee %s failures',
    async failureMarker => {
      const log = [
        'Issues found in 2 inputs. Find details below.',
        '[docs/example.md]:',
        '[500] https://github.com/example/project (at 1:1) | Rejected status code: 500',
        '[docs/other.md]:',
        `[${failureMarker}] https://example.com/slow (at 1:1) | Failed`,
        '##[error]Process completed with exit code 2.',
      ].join('\n')

      const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    },
  )

  it('does not match non-GitHub 5xx link failures', async () => {
    const log = [
      'Issues found in 1 input. Find details below.',
      '[docs/example.md]:',
      '[500] https://example.com/service (at 1:1) | Rejected status code: 500',
      '##[error]Process completed with exit code 2.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match wrong workflow or sibling failed jobs', async () => {
    const wrongWorkflow = await decide(
      makeCtx({ workflowName: 'CI', failedJobLogs: failedJobLogs(github500Log) }),
      RULES,
    )
    const mixedJobs = await decide(
      makeCtx({
        failedJobNames: [lintLinksJobName, 'build'],
        failedJobLogs: failedJobLogs(github500Log),
      }),
      RULES,
    )

    expect(wrongWorkflow.decision).toBe('dispatch')
    expect(mixedJobs.decision).toBe('dispatch')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({ runAttempt: 2, failedJobLogs: failedJobLogs(github500Log) }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})

describe('lint-links-setup-lychee-download-flake', () => {
  const setupLycheeCurl28Log = [
    'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
    'lint-links\tRun ./.github/actions/setup-lychee\tci_download_to "${BASE_URL}/lychee-${LYCHEE_PLATFORM}.tar.gz" "$LYCHEE_ARCHIVE"',
    'lint-links\tRun ./.github/actions/setup-lychee\tcurl: (28) SSL connection timeout',
    'lint-links\tRun ./.github/actions/setup-lychee\tDOWNLOAD FAILED: https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-x86_64-unknown-linux-gnu.tar.gz -> HTTP 302',
    'lint-links\tRun ./.github/actions/setup-lychee\t##[error]Process completed with exit code 1.',
  ].join('\n')

  it('matches a composite inner-group setup-lychee GitHub Releases curl 28 timeout', async () => {
    const log = [
      'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
      'lint-links\tInstall lychee\t##[group]Run set -euo pipefail',
      'lint-links\tInstall lychee\tbash "$GITHUB_WORKSPACE/ci/install-github-release.sh" --repo lycheeverse/lychee',
      'lint-links\tInstall lychee\tcurl: (28) SSL connection timeout',
      'lint-links\tInstall lychee\tDOWNLOAD FAILED: https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-x86_64-unknown-linux-gnu.tar.gz -> HTTP 302',
      'lint-links\tInstall lychee\t##[error]Process completed with exit code 1.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('lint-links-setup-lychee-download-flake')
  })

  it('matches the setup-lychee GitHub Releases curl 28 timeout on attempt 1', async () => {
    const result = await decide(
      makeCtx({ failedJobLogs: failedJobLogs(setupLycheeCurl28Log) }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('lint-links-setup-lychee-download-flake')
  })

  it.each([500, 502, 503, 504])('matches setup-lychee release download HTTP %s', async status => {
    const log = [
      'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
      `lint-links\tRun ./.github/actions/setup-lychee\tDOWNLOAD FAILED: https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-x86_64-unknown-linux-gnu.tar.gz -> HTTP ${status}`,
      'lint-links\tRun ./.github/actions/setup-lychee\t##[error]Process completed with exit code 1.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('lint-links-setup-lychee-download-flake')
  })

  it('matches setup-lychee curl 56 release download failures before an HTTP 302 redirect', async () => {
    const log = [
      'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
      'lint-links\tRun ./.github/actions/setup-lychee\tcurl: (56) Recv failure: Connection reset by peer',
      'lint-links\tRun ./.github/actions/setup-lychee\tDOWNLOAD FAILED: https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-x86_64-unknown-linux-gnu.tar.gz -> HTTP 302',
      'lint-links\tRun ./.github/actions/setup-lychee\t##[error]Process completed with exit code 1.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('lint-links-setup-lychee-download-flake')
  })

  it('does not match a recovered setup-lychee curl flake followed by Check links exit 1', async () => {
    const log = [
      'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
      'lint-links\tRun ./.github/actions/setup-lychee\tcurl: (28) SSL connection timeout',
      'lint-links\tRun ./.github/actions/setup-lychee\tlychee 0.24.2',
      'lint-links\tCheck links\t##[group]Run ./ci/lint-links.sh',
      'lint-links\tCheck links\t##[error]Process completed with exit code 1.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a non-transient setup-lychee 404', async () => {
    const log = [
      'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
      'lint-links\tRun ./.github/actions/setup-lychee\tDOWNLOAD FAILED: https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-x86_64-unknown-linux-gnu.tar.gz -> HTTP 404',
      'lint-links\tRun ./.github/actions/setup-lychee\t##[error]Process completed with exit code 1.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a release download failure before setup-lychee starts', async () => {
    const log = [
      'lint-links\tRun unrelated setup\tDOWNLOAD FAILED: https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-x86_64-unknown-linux-gnu.tar.gz -> HTTP 500',
      'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
      'lint-links\tRun ./.github/actions/setup-lychee\tUnsupported platform: Linux-riscv64',
      'lint-links\tRun ./.github/actions/setup-lychee\t##[error]Process completed with exit code 1.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a different setup-lychee failure without a release-download fingerprint', async () => {
    const log = [
      'lint-links\tRun ./.github/actions/setup-lychee\t##[group]Run ./.github/actions/setup-lychee',
      'lint-links\tRun ./.github/actions/setup-lychee\tUnsupported platform: Linux-riscv64',
      'lint-links\tRun ./.github/actions/setup-lychee\t##[error]Process completed with exit code 1.',
    ].join('\n')

    const result = await decide(makeCtx({ failedJobLogs: failedJobLogs(log) }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match wrong workflow or sibling failed jobs', async () => {
    const wrongWorkflow = await decide(
      makeCtx({ workflowName: 'CI', failedJobLogs: failedJobLogs(setupLycheeCurl28Log) }),
      RULES,
    )
    const mixedJobs = await decide(
      makeCtx({
        failedJobNames: [lintLinksJobName, 'build'],
        failedJobLogs: failedJobLogs(setupLycheeCurl28Log),
      }),
      RULES,
    )

    expect(wrongWorkflow.decision).toBe('dispatch')
    expect(mixedJobs.decision).toBe('dispatch')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({ runAttempt: 2, failedJobLogs: failedJobLogs(setupLycheeCurl28Log) }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
