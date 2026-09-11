import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const gitAndPrsText = readFileSync('.agents/skills/agent-workflow/git-and-prs.md', 'utf8')
const promptText = readFileSync('docs/prompts/automation/shepherd.md', 'utf8')

const STOP_AND_REPORT_ACTIONS = ['CANCEL', 'CLOSED', 'ESCALATE'] as const
const ACTION_CONTRACT_SNAPSHOT_STATUSES = ['READY', 'CLEAN', 'NO_REVIEW_DECISION'] as const

// Matches a backtick-quoted, comma/and-separated list of ALL-CAPS names immediately before
// `trailingPhrase`, then requires every name in `requiredTokens` to appear somewhere in that list —
// independent of order or position — so inserting an unrelated name anywhere in the list (including
// after the last required one) can't false-red this test, while dropping or misspelling a required
// name still does. Apply against whitespace-normalized text (see call sites) so a prose rewrap can't
// false-red it either.
function listStillContainsEvery(
  text: string,
  requiredTokens: readonly string[],
  trailingPhrase: string,
): boolean {
  const backtickToken = '`[A-Z_]+`'
  const listPattern = new RegExp(`((?:${backtickToken}[,\\s]*(?:and\\s+)?)+)${trailingPhrase}`, 'u')
  const match = listPattern.exec(text)
  return match !== null && requiredTokens.every(token => match[1].includes(`\`${token}\``))
}

// Locks the tolerance itself: these must keep matching even though none is the doc's exact current
// wording, so a future edit narrowing the check back to a literal gets caught here. Also locks that
// dropping a required name is still caught, regardless of where in the list it would have appeared.
describe('shepherd guidance regex tolerance', () => {
  it('matches a doc list with an additional inserted action name, regardless of position', () => {
    expect(
      listStillContainsEvery(
        '`CANCEL`, `CLOSED`, `MERGE`, and `ESCALATE` mean stop and report',
        STOP_AND_REPORT_ACTIONS,
        'mean stop and report',
      ),
    ).toBe(true)
    expect(
      listStillContainsEvery(
        '`CANCEL`, `ESCALATE`, `CLOSED`, and `MERGE` mean stop and report',
        STOP_AND_REPORT_ACTIONS,
        'mean stop and report',
      ),
    ).toBe(true)
  })

  it('does not match when a required action name is dropped', () => {
    expect(
      listStillContainsEvery(
        '`CANCEL` and `ESCALATE` mean stop and report',
        STOP_AND_REPORT_ACTIONS,
        'mean stop and report',
      ),
    ).toBe(false)
  })

  it('matches a doc snapshot list with an additional inserted status name, regardless of position', () => {
    expect(
      listStillContainsEvery(
        'Status details like `READY`, `CLEAN`, `WAIT`, and `NO_REVIEW_DECISION` are snapshots, not the action contract',
        ACTION_CONTRACT_SNAPSHOT_STATUSES,
        'are snapshots, not the action contract',
      ),
    ).toBe(true)
  })

  it('does not match when a required status name is dropped', () => {
    expect(
      listStillContainsEvery(
        'Status details like `READY` and `CLEAN` are snapshots, not the action contract',
        ACTION_CONTRACT_SNAPSHOT_STATUSES,
        'are snapshots, not the action contract',
      ),
    ).toBe(false)
  })
})

describe('shepherd guidance', () => {
  it('keeps the workflow guidance on printed instructions and explicit action states', () => {
    expect(gitAndPrsText).toContain('pnpm exec pr-shepherd iterate <pr>')
    expect(gitAndPrsText).toContain(
      'pnpm exec pr-shepherd <pr> --interval 60s --timeout 4.5m --quiet-status',
    )
    expect(gitAndPrsText).toContain(
      'pnpm exec pr-shepherd <pr> --interval 60s --until-terminal --quiet-status',
    )
    expect(gitAndPrsText).toContain('printed `## Instructions` section exactly')
    expect(gitAndPrsText).toContain(
      '`FIX_CODE` means act on the instructions, then rerun the positional-default command `pnpm exec pr-shepherd <pr> --interval 60s --until-terminal --quiet-status`',
    )
    expect(
      listStillContainsEvery(
        gitAndPrsText.replace(/\s+/gu, ' '),
        STOP_AND_REPORT_ACTIONS,
        'mean stop and report',
      ),
    ).toBe(true)
    expect(
      listStillContainsEvery(
        gitAndPrsText.replace(/\s+/gu, ' '),
        ACTION_CONTRACT_SNAPSHOT_STATUSES,
        'are snapshots, not the action contract',
      ),
    ).toBe(true)
    expect(gitAndPrsText).toContain('Claude Code plugin: `/pr-shepherd:pr-shepherd <pr>`')
    expect(gitAndPrsText).toContain('Codex plugin: `$pr-shepherd:pr-shepherd <pr>`')
    expect(gitAndPrsText).not.toContain('pnpm exec pr-shepherd poll')
    expect(gitAndPrsText).not.toContain('pnpm exec pr-shepherd <pr-number>')
    expect(gitAndPrsText).not.toMatch(/pr-shepherd:(check|monitor)/)
    expect(gitAndPrsText).not.toContain('cool down')
  })

  it('bounds the automation prompt without delegating to an unbounded plugin goal', () => {
    expect(promptText).toContain(
      'pr-shepherd {{PR_NUMBER}} --interval 60s --until-terminal --quiet-status',
    )
    expect(promptText.replace(/\s+/gu, ' ')).toContain('printed `## Instructions` exactly')
    expect(
      listStillContainsEvery(
        promptText.replace(/\s+/gu, ' '),
        STOP_AND_REPORT_ACTIONS,
        'mean stop and report',
      ),
    ).toBe(true)
    expect(promptText).not.toMatch(/(?:\/goal update PR|\$pr-shepherd:pr-shepherd)/u)
  })

  it('uses the trusted host only against the current PR head', () => {
    expect(promptText).toContain('`{{PR_SHEPHERD_VERSION}}`')
    expect(promptText).toContain('`pr-shepherd --version`')
    expect(promptText).not.toContain('harness-trusted-git')
  })
})
