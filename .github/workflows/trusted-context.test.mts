import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type TrustedContextStep = {
  id?: string
  run?: string
}

function evaluateTrustedContext(
  actor: string,
  headRepo: string,
  baseRepo: string,
  eventName = 'pull_request',
): Record<string, string> {
  const workflow = load(readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8')) as {
    jobs?: { 'detect-changes'?: { steps?: TrustedContextStep[] } }
  }
  const script = workflow.jobs?.['detect-changes']?.steps?.find(
    step => step.id === 'trusted-context',
  )?.run
  expect(script).toBeTruthy()

  const outputDir = mkdtempSync(join(tmpdir(), 'trusted-context-'))
  const outputPath = join(outputDir, 'output')
  try {
    execFileSync('bash', ['-c', script!], {
      env: {
        ...process.env,
        ACTOR: actor,
        BASE_REPO: baseRepo,
        EVENT_NAME: eventName,
        GITHUB_OUTPUT: outputPath,
        HEAD_REPO: headRepo,
      },
    })
    return Object.fromEntries(
      readFileSync(outputPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split('=', 2) as [string, string]),
    )
  } finally {
    rmSync(outputDir, { force: true, recursive: true })
  }
}

describe('CI trusted context classifier', () => {
  it('evaluates literal bot actors without granting them trusted-secret context', () => {
    expect(evaluateTrustedContext('dependabot[bot]', 'voucha/repo', 'voucha/repo')).toEqual({
      trusted: 'false',
      'dependency-bot-test': 'true',
    })
    expect(evaluateTrustedContext('renovate[bot]', 'voucha/repo', 'voucha/repo')).toEqual({
      trusted: 'false',
      'dependency-bot-test': 'true',
    })
    expect(evaluateTrustedContext('human', 'voucha/repo', 'voucha/repo')).toEqual({
      trusted: 'true',
      'dependency-bot-test': 'false',
    })
    expect(evaluateTrustedContext('dependabotb', 'voucha/fork', 'voucha/repo')).toEqual({
      trusted: 'false',
      'dependency-bot-test': 'false',
    })
    expect(evaluateTrustedContext('dependabot[bot]', '', '', 'push')).toEqual({
      trusted: 'true',
      'dependency-bot-test': 'false',
    })
    expect(evaluateTrustedContext('human', 'voucha/repo', 'voucha/repo', 'merge_group')).toEqual({
      trusted: 'false',
      'dependency-bot-test': 'false',
    })
  })
})
