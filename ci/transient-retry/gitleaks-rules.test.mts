import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'

import { RULES, type WorkflowRunContext } from './rules.mts'

const gitleaksJobName = 'gitleaks'
const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('Gitleaks transient retry rules', () => {
  const installTimeoutLog = [
    'gitleaks\tInstall gitleaks\t##[group]Run : "${RUNNER_TEMP:?RUNNER_TEMP must be set by GitHub Actions}"; then',
    'gitleaks\tInstall gitleaks\tbash "$GITHUB_WORKSPACE/ci/install-github-release.sh" --repo gitleaks/gitleaks --version "$GITLEAKS_VERSION"',
    "gitleaks\tInstall gitleaks\t##[error]The action 'Install gitleaks' has timed out after 2 minutes.",
  ].join('\n')
  const installHttp504Log = [
    'gitleaks\tInstall gitleaks\t##[group]Run bash "$GITHUB_WORKSPACE/ci/install-github-release.sh" --repo gitleaks/gitleaks',
    'gitleaks\tInstall gitleaks\tcurl: (22) The requested URL returned error: 504',
    'gitleaks\tInstall gitleaks\t##[error]Process completed with exit code 1.',
  ].join('\n')
  const installChecksumTimeoutLog = [
    'gitleaks\tInstall gitleaks\t##[group]Run bash "$GITHUB_WORKSPACE/ci/install-github-release.sh" --repo gitleaks/gitleaks --checksums-asset gitleaks_{version}_checksums.txt',
    "gitleaks\tInstall gitleaks\t##[error]The action 'Install gitleaks' has timed out after 2 minutes.",
  ].join('\n')
  const installChecksumHttp504Log = [
    'gitleaks\tInstall gitleaks\t##[group]Run bash "$GITHUB_WORKSPACE/ci/install-github-release.sh" --repo gitleaks/gitleaks --checksums-asset gitleaks_{version}_checksums.txt',
    'gitleaks\tInstall gitleaks\tcurl: (22) The requested URL returned error: 504',
    'gitleaks\tInstall gitleaks\t##[error]Process completed with exit code 1.',
  ].join('\n')
  const installHttp000Log = [
    'gitleaks\tInstall gitleaks\t##[group]Run bash "$GITHUB_WORKSPACE/ci/install-github-release.sh" --repo gitleaks/gitleaks',
    'gitleaks\tInstall gitleaks\tcurl: (56) Recv failure: Connection reset by peer',
    'gitleaks\tInstall gitleaks\t##[error]Process completed with exit code 1.',
  ].join('\n')
  const installChecksumHttp000Log = [
    'gitleaks\tInstall gitleaks\t##[group]Run bash "$GITHUB_WORKSPACE/ci/install-github-release.sh" --repo gitleaks/gitleaks --checksums-asset gitleaks_{version}_checksums.txt',
    'gitleaks\tInstall gitleaks\tcurl: (56) Recv failure: Connection reset by peer',
    'gitleaks\tInstall gitleaks\t##[error]Process completed with exit code 1.',
  ].join('\n')

  it('matches the Gitleaks install download timeout on attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, installTimeoutLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('gitleaks-install-releases-download-flake')
  })

  it('matches a Gitleaks install download HTTP 504 on attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, installHttp504Log]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('gitleaks-install-releases-download-flake')
  })

  it('matches a Gitleaks install checksum download timeout on attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, installChecksumTimeoutLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('gitleaks-install-releases-download-flake')
  })

  it('matches a Gitleaks install checksum download HTTP 504 on attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, installChecksumHttp504Log]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('gitleaks-install-releases-download-flake')
  })

  it('matches a Gitleaks install archive download HTTP 000 (transport failure) on attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, installHttp000Log]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('gitleaks-install-releases-download-flake')
  })

  it('matches a Gitleaks install checksum download HTTP 000 (transport failure) on attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, installChecksumHttp000Log]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('gitleaks-install-releases-download-flake')
  })

  it('does not match a recovered install curl flake followed by a scan leak', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              gitleaksJobName,
              [
                'gitleaks\tInstall gitleaks\t##[group]Run bash "$GITHUB_WORKSPACE/ci/install-github-release.sh" --repo gitleaks/gitleaks',
                'gitleaks\tInstall gitleaks\tcurl: (22) The requested URL returned error: 504',
                'gitleaks\tInstall gitleaks\tgitleaks version 8.30.1',
                'gitleaks\tScan git history\t##[group]Run gitleaks git --config .gitleaks.toml',
                'gitleaks\tScan git history\t##[error]Process completed with exit code 1.',
              ].join('\n'),
            ],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another Gitleaks failure needs investigation', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              gitleaksJobName,
              [
                'gitleaks\tScan git history\t##[group]Run gitleaks git --config .gitleaks.toml',
                'gitleaks\tScan git history\t##[error]Process completed with exit code 1.',
              ].join('\n'),
            ],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when an additional failed job needs investigation', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      failedJobNames: [gitleaksJobName, 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, installTimeoutLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      workflowName: 'Gitleaks',
      runAttempt: 2,
      failedJobNames: [gitleaksJobName],
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, installHttp504Log]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
