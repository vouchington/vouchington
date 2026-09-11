import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const execFileAsync = promisify(execFile)

type ScreenshotCommandResult = {
  exitCode: number | string
  ghLog?: string
  output: string
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function runScreenshotCommand(forwardedArgs: string[]): Promise<ScreenshotCommandResult> {
  const directory = await mkdtemp(join(tmpdir(), 'voucha-screenshot-preflight-'))
  const ghPath = join(directory, 'gh')
  const ghLogPath = join(directory, 'gh.log')
  try {
    await writeFile(
      ghPath,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" > "$GH_STUB_LOG"\nprintf \'stub gh failure\\n\' >&2\nexit 1\n',
    )
    await chmod(ghPath, 0o755)

    let exitCode: number | string = 0
    let output = ''
    try {
      await execFileAsync('pnpm', ['run', 'pr:attach-screenshots', ...forwardedArgs], {
        cwd: repoRoot,
        env: {
          ...process.env,
          GH_STUB_LOG: ghLogPath,
          PATH: `${directory}:${process.env.PATH ?? ''}`,
        },
      })
    } catch (error) {
      const result = error as Error & {
        code?: number | string
        stderr?: string
        stdout?: string
      }
      exitCode = result.code ?? 'unknown'
      output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    }

    return { exitCode, ghLog: await readOptionalFile(ghLogPath), output }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function normalizedMarkdown(path: string): string {
  return readRepoFile(path).replace(/\s+/g, ' ').trim()
}

function normalizedMarkdownListItem(path: string, marker: string): string {
  const listItem = readRepoFile(path)
    .split(/^-\s+/mu)
    .find(item => item.includes(marker))

  expect(listItem).toBeDefined()
  return listItem?.replace(/\s+/g, ' ').trim() ?? ''
}

function hasLongRunningPrShepherdInvocation(paragraph: string): boolean {
  return /(?:--until-terminal|\/pr-shepherd:pr-shepherd|\$pr-shepherd:pr-shepherd)/u.test(paragraph)
}

function hasPrShepherdDeadlineRegression(paragraph: string): boolean {
  return (
    /\bpr-shepherd\b/u.test(paragraph) && /\b(?:one-hour|session[ -]deadline)\b/iu.test(paragraph)
  )
}

describe('agent workflow documentation', () => {
  it('scopes pr-shepherd session deadline wording to pr-shepherd docs', () => {
    expect(
      hasPrShepherdDeadlineRegression(
        "The one-hour freshness TTL mirrors oauth-google's JWKS cache.",
      ),
    ).toBe(false)
    expect(
      hasPrShepherdDeadlineRegression(
        'Run pr-shepherd until a one-hour session deadline, then stop.',
      ),
    ).toBe(true)
  })

  it('terminates every documented long-running pr-shepherd invocation on CANCEL/ESCALATE, never a session-hour cap', () => {
    const paths = execFileSync('git', ['ls-files', '-z', '--', '*.md'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter(path => existsSync(join(repoRoot, path)))

    const deadlineRegressions: string[] = []
    const unterminatedInvocations: string[] = []
    for (const path of paths) {
      const paragraphs = readRepoFile(path).split(/\n\s*\n/u)
      for (const [index, paragraph] of paragraphs.entries()) {
        if (hasPrShepherdDeadlineRegression(paragraph)) {
          deadlineRegressions.push(`${path}:paragraph-${index + 1}`)
        }
        if (!hasLongRunningPrShepherdInvocation(paragraph)) {
          continue
        }
        if (!/CANCEL/u.test(paragraph) || !/ESCALATE/u.test(paragraph)) {
          unterminatedInvocations.push(`${path}:paragraph-${index + 1}`)
        }
      }
    }

    // Regression guard: the one-hour session deadline was removed (agents poll until
    // pr-shepherd itself reaches CANCEL or ESCALATE, never a caller-enforced wall clock) —
    // see .agents/skills/agent-workflow/git-and-prs.md's pr-shepherd termination contract.
    expect(deadlineRegressions).toEqual([])
    expect(unterminatedInvocations).toEqual([])
  })

  it('preflights screenshot upload credentials before initializing the web stack', () => {
    const credentialPreflightCommand = '`pnpm run pr:attach-screenshots --check-upload-credentials`'
    const credentialPreflightDirective = normalizedMarkdownListItem(
      '.agents/skills/agent-workflow/start-of-work.md',
      credentialPreflightCommand,
    )
    const monorepoInitialization = credentialPreflightDirective.indexOf(
      '`./dev/initialize monorepo`',
    )
    const credentialPreflight = credentialPreflightDirective.indexOf(credentialPreflightCommand)
    const webInitialization = credentialPreflightDirective.indexOf(
      '`./dev/initialize web`',
      credentialPreflight,
    )

    expect(monorepoInitialization).toBeGreaterThanOrEqual(0)
    expect(credentialPreflight).toBeGreaterThan(monorepoInitialization)
    expect(webInitialization).toBeGreaterThan(credentialPreflight)
  })

  it('forwards credential mode through the root package script', async () => {
    const result = await runScreenshotCommand(['--check-upload-credentials'])

    expect(result.exitCode).not.toBe(0)
    expect(result.ghLog).toBe('--version\n')
    expect(result.output).toContain('`gh` (GitHub CLI) is not installed or not on PATH.')
    expect(result.output).not.toContain('cannot be combined with attachment arguments')
  })

  it('rejects the old pnpm separator before invoking gh', async () => {
    const result = await runScreenshotCommand(['--', '--check-upload-credentials'])

    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('cannot be combined with attachment arguments')
    expect(result.ghLog).toBeUndefined()
  })

  it('does not document a pnpm separator for screenshot CLI arguments', () => {
    const paths = execFileSync('git', ['ls-files', '-z', '--', '*.md'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter(path => existsSync(join(repoRoot, path)))

    expect(paths).toContain('web/CLAUDE.md')
    for (const path of paths) {
      expect(readRepoFile(path)).not.toContain('pr:attach-screenshots -- ')
    }
  })

  it('documents screenshot preflight fallback and split reporting', () => {
    const workflow = normalizedMarkdown('.agents/skills/agent-workflow/implementation.md')

    expect(workflow).toContain('Visual verification:')
  })

  it('requires live browser preflight during planning and independent validation reporting', () => {
    const startRaw = readRepoFile('.agents/skills/planning/references/live-browser-preflight.md')
    const start = normalizedMarkdown('.agents/skills/planning/references/live-browser-preflight.md')
    const implementation = normalizedMarkdown('.agents/skills/agent-workflow/implementation.md')

    expect(start).toContain('## Live browser preflight')
    expect(start).toContain('Status: `not-required`')
    expect(start).toContain('(`not-required`, `available`, or `exception`)')
    expect(startRaw).toContain('- Status: `available`')
    expect(startRaw).toContain('- Surface:')
    expect(startRaw).toContain('- Evidence:')
    expect(startRaw).toContain('- Status: `exception`')
    expect(startRaw).toContain('- Reason:')
    expect(implementation).toContain('Automated browser tests:')
    expect(implementation).toContain('Screenshot attachment:')
  })

  it('documents harness background-task, wakeup-turn-boundary, ready-run, and lease-race gotchas', () => {
    const gitAndPrs = normalizedMarkdown('.agents/skills/agent-workflow/git-and-prs.md')
    const rerunReference = normalizedMarkdown(
      'ci/transient-retry/reference-how-agents-should-use-this-on-non-main-non-dependabot-pr-branches.md',
    )

    expect(gitAndPrs).toContain('run_in_background')
    expect(gitAndPrs).toContain('ScheduleWakeup')
    expect(gitAndPrs).toContain('--force-with-lease=<branch>:<sha>')
    expect(rerunReference).toContain('Ineffective rerun patterns')
  })

  it('keeps unbounded tool output out of the main session', () => {
    const startOfWork = normalizedMarkdown('.agents/skills/agent-workflow/start-of-work.md')
    const gitAndPrs = normalizedMarkdown('.agents/skills/agent-workflow/git-and-prs.md')
    const triagePrs = readRepoFile('.agents/skills/triage-prs/SKILL.md')

    expect(startOfWork).toContain('review-ci-logs')
    expect(gitAndPrs).toContain('review-ci-logs')
    expect(triagePrs).not.toContain('--log-failed')
    expect(triagePrs).toContain('review-ci-logs')
  })
})
