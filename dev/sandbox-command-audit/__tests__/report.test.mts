import { describe, expect, it } from 'vitest'

import type { CategorizedAudit } from '../classify.mts'
import { formatMarkdown, formatRaw, formatReport } from '../report.mts'
import { emptyScanResult, type ScanResult } from '../types.mts'

function emptyCategorized(): CategorizedAudit {
  return {
    genuineBypassCandidates: [],
    genuineBypassUnresolvedCount: 0,
    blockCandidates: [],
    blockCandidateUnresolvedCount: 0,
    escalationPressure: {
      claudeCovered: [],
      claudeUncovered: [],
      claudeUnresolvedCount: 0,
      e2bigCount: 0,
    },
    policyBlockCount: 0,
    worktreeDenialCount: 0,
    claudeFilesScanned: 0,
    codexFilesScanned: 0,
    readErrorCount: 0,
    repoRoots: [],
    skippedOtherRepo: { claude: 0, codex: 0 },
    skippedUnknownCwd: { claude: 0, codex: 0 },
    rawRetention: emptyScanResult().rawRetention,
  }
}

// A distinctive full-command string that must NEVER appear in default (non-raw) output —
// only its normalized prefix ("curl") is privacy-safe to render.
const SENSITIVE_COMMAND = 'curl https://internal.example/secret-token?key=abcd1234efgh5678'

describe('formatMarkdown', () => {
  it('renders (none) placeholders and zero counts for an all-empty categorized audit', () => {
    const output = formatMarkdown(emptyCategorized())
    expect(output).toContain('=== Sandbox Command Audit ===')
    expect(output).toContain('## 1. Genuine bypass candidates')
    expect(output.match(/\(none\)/g)?.length).toBe(4)
    expect(output).toContain('E2BIG failures')
    expect(output).toContain('## Denial hygiene')
    expect(output).toContain('Scanned 0 Claude transcript file(s), 0 Codex transcript file(s).')
    expect(output).not.toContain('Read errors')
  })

  it('renders a scope line naming the repo root, worktree count, and skip counts', () => {
    const categorized = emptyCategorized()
    categorized.repoRoots = ['/repo/root', '/repo/.worktrees/one']
    categorized.claudeFilesScanned = 50
    categorized.codexFilesScanned = 12
    categorized.skippedOtherRepo = { claude: 200, codex: 14 }
    categorized.skippedUnknownCwd = { claude: 3, codex: 0 }
    const output = formatMarkdown(categorized)
    expect(output).toContain(
      'Scope: /repo/root (+1 worktree) — 50 Claude / 12 Codex files scanned; 214 skipped (other repo), 3 skipped (cwd unknown)',
    )
  })

  it('pluralizes the worktree suffix for more than one worktree', () => {
    const categorized = emptyCategorized()
    categorized.repoRoots = ['/repo/root', '/repo/.worktrees/one', '/repo/.worktrees/two']
    const output = formatMarkdown(categorized)
    expect(output).toContain('Scope: /repo/root (+2 worktrees) —')
  })

  it('renders a scope line with no skip suffix and a placeholder when no repo root resolved', () => {
    const output = formatMarkdown(emptyCategorized())
    expect(output).toContain('Scope: (no repo root resolved) — 0 Claude / 0 Codex files scanned')
    expect(output).not.toContain('skipped')
  })

  it('renders genuine bypass candidates with an already-in-allow-list annotation', () => {
    const categorized = emptyCategorized()
    categorized.genuineBypassCandidates = [
      { prefix: 'chmod 000', count: 2, alreadyInAllowList: false },
      { prefix: 'git status', count: 1, alreadyInAllowList: true },
    ]
    const output = formatMarkdown(categorized)
    expect(output).toContain('  - chmod 000 (2)')
    expect(output).toContain('  - git status (1) [already in permissions.allow]')
  })

  it('renders block candidates with an already-denied annotation', () => {
    const categorized = emptyCategorized()
    categorized.blockCandidates = [
      { prefix: 'curl evil.example', count: 1, alreadyDenied: false },
      { prefix: 'git push', count: 3, alreadyDenied: true },
    ]
    const output = formatMarkdown(categorized)
    expect(output).toContain('  - curl evil.example (1)')
    expect(output).toContain('  - git push (3) [already in permissions.deny]')
  })

  it('renders escalation pressure covered/uncovered lists and e2bigCount', () => {
    const categorized = emptyCategorized()
    categorized.escalationPressure = {
      claudeCovered: [{ prefix: 'pnpm exec', count: 4 }],
      claudeUncovered: [{ prefix: 'git push', count: 1 }],
      claudeUnresolvedCount: 0,
      e2bigCount: 7,
    }
    const output = formatMarkdown(categorized)
    expect(output).toContain('  - pnpm exec (4)')
    expect(output).toContain('  - git push (1)')
    expect(output).toContain(
      'E2BIG failures (argument-list-too-long sandbox artifact, separate root cause — not a candidate list): 7',
    )
  })

  it('renders an unresolved-command note only when the count is greater than zero', () => {
    const categorized = emptyCategorized()
    categorized.genuineBypassUnresolvedCount = 2
    categorized.blockCandidateUnresolvedCount = 0
    const output = formatMarkdown(categorized)
    expect(output).toContain('(+2 with an unresolved command — rerun with --raw to inspect)')
    expect(output.match(/\(\+\d+ with an unresolved command/g)?.length).toBe(1)
  })

  it('renders an escalation-pressure unresolved-command note for Claude', () => {
    const categorized = emptyCategorized()
    categorized.escalationPressure.claudeUnresolvedCount = 1
    const output = formatMarkdown(categorized)
    expect(output).toContain('(+1 with an unresolved command — rerun with --raw to inspect)')
  })

  it('renders only a read-error count in default output, never the file path (privacy boundary)', () => {
    const categorized = emptyCategorized()
    categorized.readErrorCount = 1
    const output = formatMarkdown(categorized)
    expect(output).toContain('Read errors: 1 (rerun with --raw to inspect)')
    expect(output).not.toContain('/Users/someone')
    expect(output).not.toContain('secret-project')
  })

  it('never leaks a full raw command string into default markdown output (privacy boundary)', () => {
    const categorized = emptyCategorized()
    categorized.genuineBypassCandidates = [{ prefix: 'curl', count: 1, alreadyInAllowList: false }]
    const output = formatMarkdown(categorized)
    expect(output).not.toContain(SENSITIVE_COMMAND)
    expect(output).not.toContain('secret-token')
  })

  it('renders the worktree-denial count with actionable write-path text, only when non-zero', () => {
    const zero = formatMarkdown(emptyCategorized())
    expect(zero).not.toContain('Worktree write-path denials')

    const categorized = emptyCategorized()
    categorized.worktreeDenialCount = 3
    const output = formatMarkdown(categorized)
    expect(output).toContain('Worktree write-path denials (fix sandbox write-path config')
    expect(output).toContain(': 3')
    expect(output).toContain('rerun with --raw to inspect')
  })

  it('never leaks an absolute worktree path into default markdown output (privacy boundary)', () => {
    const categorized = emptyCategorized()
    categorized.worktreeDenialCount = 1
    const output = formatMarkdown(categorized)
    expect(output).not.toContain('/Users/')
  })
})

describe('formatRaw', () => {
  it('renders Codex sandbox-failure details only in raw mode', () => {
    const command = 'git branch -m old new'
    const errorText =
      'error: unable to move logfile /Users/redacted/repo/.git/logs/refs/heads/old to logs/refs/heads/new: Operation not permitted'
    const scan: ScanResult = {
      ...emptyScanResult(),
      codexSandboxFailures: [{ source: 'codex', kind: 'worktree-denial', command, errorText }],
    }
    const categorized = emptyCategorized()
    categorized.worktreeDenialCount = 1

    const defaultOutput = formatReport(scan, categorized)
    expect(defaultOutput).toContain('Worktree write-path denials')
    expect(defaultOutput).not.toContain(command)
    expect(defaultOutput).not.toContain('/Users/redacted')

    const defaultJson = formatReport(scan, categorized, { json: true })
    expect(defaultJson).not.toContain(command)
    expect(defaultJson).not.toContain('/Users/redacted')

    const rawOutput = formatRaw(scan)
    expect(rawOutput).toContain('sandbox-failure text')
    expect(rawOutput).toContain('## Codex sandbox failures — 1')
    expect(rawOutput).toContain(`[worktree-denial] ${command}: ${errorText}`)
  })

  it('renders full command text, justifications, and the raw-mode warning banner', () => {
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeEscalations: [{ source: 'claude', command: SENSITIVE_COMMAND }],
      claudeDenials: [{ source: 'claude', kind: 'user-rejected', command: 'rm -rf /tmp/x' }],
      claudeSandboxFailures: [
        {
          source: 'claude',
          kind: 'genuine',
          command: 'chmod 000 x',
          errorText: 'Operation not permitted',
        },
      ],
      readErrors: ['/Users/someone/.claude/projects/secret-project/a.jsonl: EACCES'],
    }
    const output = formatRaw(scan)
    expect(output).toContain('RAW MODE')
    expect(output).toContain('Local inspection only')
    expect(output).toContain(SENSITIVE_COMMAND)
    expect(output).toContain('[user-rejected] rm -rf /tmp/x')
    expect(output).toContain('[genuine] chmod 000 x: Operation not permitted')
    expect(output).toContain('## Read errors — 1')
    expect(output).toContain('/Users/someone/.claude/projects/secret-project/a.jsonl: EACCES')
  })

  it('renders a scope line naming the repo root and skip counts in raw output too', () => {
    const scan: ScanResult = {
      ...emptyScanResult(),
      repoRoots: ['/repo/root'],
      claudeFilesScanned: 50,
      codexFilesScanned: 50,
      skippedOtherRepo: { claude: 100, codex: 114 },
    }
    const output = formatRaw(scan)
    expect(output).toContain(
      'Scope: /repo/root — 50 Claude / 50 Codex files scanned; 214 skipped (other repo)',
    )
  })

  it('renders an (unresolved) placeholder for an undefined command', () => {
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeDenials: [{ source: 'claude', kind: 'user-rejected', command: undefined }],
      claudeSandboxFailures: [
        { source: 'claude', kind: 'e2big', command: undefined, errorText: 'E2BIG' },
      ],
    }
    const output = formatRaw(scan)
    expect(output).toContain('[user-rejected] (unresolved)')
    expect(output).toContain('[e2big] (unresolved): E2BIG')
  })
})

describe('formatReport', () => {
  it('defaults to markdown rendering of the categorized audit', () => {
    const output = formatReport(emptyScanResult(), emptyCategorized())
    expect(output).toContain('=== Sandbox Command Audit ===')
    expect(output).toContain('## 1. Genuine bypass candidates')
  })

  it('renders raw text when options.raw is true', () => {
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeEscalations: [{ source: 'claude', command: SENSITIVE_COMMAND }],
    }
    const output = formatReport(scan, emptyCategorized(), { raw: true })
    expect(output).toContain('RAW MODE')
    expect(output).toContain(SENSITIVE_COMMAND)
  })

  it('renders categorized JSON when options.json is true without raw', () => {
    const categorized = emptyCategorized()
    categorized.policyBlockCount = 3
    const output = formatReport(emptyScanResult(), categorized, { json: true })
    const parsed: unknown = JSON.parse(output)
    expect(parsed).toEqual(categorized)
  })

  it('renders raw scan JSON when both options.json and options.raw are true', () => {
    const scan: ScanResult = {
      ...emptyScanResult(),
      claudeEscalations: [{ source: 'claude', command: SENSITIVE_COMMAND }],
    }
    const output = formatReport(scan, emptyCategorized(), { json: true, raw: true })
    const parsed: unknown = JSON.parse(output)
    expect(parsed).toEqual(scan)
  })
})
