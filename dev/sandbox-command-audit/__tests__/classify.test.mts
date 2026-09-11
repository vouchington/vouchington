import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { classifyAudit } from '../classify.mts'
import { emptyScanResult, type ScanResult } from '../types.mts'

describe('classifyAudit', () => {
  let root: string
  let settingsPath: string

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('adds Codex failures to the worktree-denial count without creating bypass candidates', () => {
    writeFixtures({})
    const scan: ScanResult = {
      ...emptyScanResult(),
      codexSandboxFailures: [
        {
          source: 'codex',
          kind: 'worktree-denial',
          command: 'git branch -m old new',
          errorText:
            'error: unable to move logfile logs/refs/heads/old to logs/refs/heads/new: Operation not permitted',
        },
      ],
    }

    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error('unexpected error')

    expect(result.worktreeDenialCount).toBe(1)
    expect(result.genuineBypassCandidates).toEqual([])
  })

  function writeFixtures(settings: unknown): void {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-classify-'))
    settingsPath = join(root, 'settings.json')
    writeFileSync(settingsPath, JSON.stringify(settings))
  }

  it('returns an error when the settings file cannot be loaded', () => {
    writeFixtures({})
    const result = classifyAudit(emptyScanResult(), { settingsPath: join(root, 'missing.json') })
    expect('error' in result).toBe(true)
  })

  it('groups genuine bypass candidates from Claude sandbox failures', () => {
    writeFixtures({
      permissions: { allow: ['Bash(git status)'] },
      sandbox: { excludedCommands: [] },
    })
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeSandboxFailures: [
        {
          source: 'claude',
          kind: 'genuine',
          command: 'chmod 000 x',
          errorText: 'Operation not permitted',
        },
        {
          source: 'claude',
          kind: 'genuine',
          command: 'chmod 000 y',
          errorText: 'Operation not permitted',
        },
        { source: 'claude', kind: 'genuine', command: 'git status', errorText: 'Denied' },
        { source: 'claude', kind: 'e2big', command: 'git status', errorText: 'E2BIG' },
      ],
    }
    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error(`expected categorized audit, got error: ${result.error}`)

    expect(result.genuineBypassCandidates).toEqual([
      { prefix: 'chmod 000', count: 2, alreadyInAllowList: false },
      { prefix: 'git status', count: 1, alreadyInAllowList: true },
    ])
    expect(result.genuineBypassUnresolvedCount).toBe(0)
  })

  it('groups block candidates from user-rejected denials and flags already-denied prefixes', () => {
    writeFixtures({ permissions: { deny: ['Bash(git push *)'] } })
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeDenials: [
        { source: 'claude', kind: 'user-rejected', command: 'git push --force origin main' },
        { source: 'claude', kind: 'user-rejected', command: 'curl evil.example' },
        { source: 'claude', kind: 'permission-rule', command: 'ignored for block candidates' },
      ],
    }
    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.blockCandidates).toEqual([
      { prefix: 'curl evil.example', count: 1, alreadyDenied: false },
      { prefix: 'git push', count: 1, alreadyDenied: true },
    ])
  })

  it('splits Claude escalation pressure into covered/uncovered', () => {
    writeFixtures({ sandbox: { excludedCommands: ['pnpm exec *'] } })
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeEscalations: [
        { source: 'claude', command: 'pnpm exec vitest run' },
        { source: 'claude', command: 'git push origin main' },
      ],
      claudeSandboxFailures: [
        { source: 'claude', kind: 'e2big', command: 'pnpm install', errorText: 'E2BIG' },
        { source: 'claude', kind: 'e2big', command: 'pnpm build', errorText: 'E2BIG' },
      ],
    }
    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error('unexpected error')

    expect(result.escalationPressure.claudeCovered).toEqual([
      { prefix: 'pnpm exec vitest', count: 1 },
    ])
    expect(result.escalationPressure.claudeUncovered).toEqual([{ prefix: 'git push', count: 1 }])
    expect(result.escalationPressure.e2bigCount).toBe(2)
  })

  it('counts denial hygiene (permission-rule + automode-blocked) without listing candidates', () => {
    writeFixtures({})
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeDenials: [
        { source: 'claude', kind: 'permission-rule', command: 'a' },
        { source: 'claude', kind: 'automode-blocked', command: 'b' },
        { source: 'claude', kind: 'user-rejected', command: 'c' },
      ],
    }
    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.policyBlockCount).toBe(2)
  })

  it('counts an unresolved command among genuine/block candidates without listing it', () => {
    writeFixtures({})
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeSandboxFailures: [
        {
          source: 'claude',
          kind: 'genuine',
          command: undefined,
          errorText: 'Operation not permitted',
        },
      ],
      claudeDenials: [{ source: 'claude', kind: 'user-rejected', command: undefined }],
    }
    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.genuineBypassCandidates).toEqual([])
    expect(result.genuineBypassUnresolvedCount).toBe(1)
    expect(result.blockCandidates).toEqual([])
    expect(result.blockCandidateUnresolvedCount).toBe(1)
  })

  it('counts worktree denials separately and excludes them from genuine bypass candidates', () => {
    writeFixtures({})
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeSandboxFailures: [
        {
          source: 'claude',
          kind: 'worktree-denial',
          command: 'git fetch',
          errorText:
            "error: cannot open '/repo/root/.git/worktrees/x/FETCH_HEAD': Operation not permitted",
        },
        {
          source: 'claude',
          kind: 'worktree-denial',
          command: 'git add .',
          errorText:
            "fatal: Unable to create '/repo/root/.git/worktrees/x/index.lock': Operation not permitted",
        },
        {
          source: 'claude',
          kind: 'genuine',
          command: 'chmod 000 x',
          errorText: 'Operation not permitted',
        },
      ],
    }
    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.worktreeDenialCount).toBe(2)
    expect(result.genuineBypassCandidates).toEqual([
      { prefix: 'chmod 000', count: 1, alreadyInAllowList: false },
    ])
  })

  it('passes through scan file counts and collapses read errors to a count', () => {
    writeFixtures({})
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeFilesScanned: 3,
      codexFilesScanned: 2,
      readErrors: ['/tmp/a.jsonl: boom'],
    }
    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.claudeFilesScanned).toBe(3)
    expect(result.codexFilesScanned).toBe(2)
    expect(result.readErrorCount).toBe(1)
  })

  it('sorts prefix counts by count desc then prefix asc', () => {
    writeFixtures({})
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeEscalations: [
        { source: 'claude', command: 'zzz cmd' },
        { source: 'claude', command: 'aaa cmd' },
        { source: 'claude', command: 'aaa cmd' },
      ],
    }
    const result = classifyAudit(scan, { settingsPath })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.escalationPressure.claudeUncovered).toEqual([
      { prefix: 'aaa cmd', count: 2 },
      { prefix: 'zzz cmd', count: 1 },
    ])
  })
})
