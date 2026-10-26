import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import {
  agentWorkflowDocViolations,
  hasPrShepherdDeadlineRegression,
} from './agent-workflow-doc-policy.mts'

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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
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
    } catch (err) {
      const result = err as Error & {
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

  it('rejects deadline and separator regressions in finite Markdown inputs', () => {
    const files = new Map([
      ['web/AGENTS.md', 'Use pr-shepherd until its terminal action.'],
      [
        'docs/agent.md',
        'Run pr-shepherd until a one-hour session deadline.\n\nRun pr:attach-screenshots -- --check-upload-credentials.',
      ],
    ])
    expect(agentWorkflowDocViolations([...files.keys()], path => files.get(path)!)).toEqual([
      'docs/agent.md:paragraph-1: pr-shepherd session deadline',
      'docs/agent.md: pnpm separator for screenshot CLI',
    ])
    expect(agentWorkflowDocViolations(['docs/agent.md'], path => files.get(path)!)).toContain(
      'web/AGENTS.md is missing from tracked Markdown',
    )
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
})
