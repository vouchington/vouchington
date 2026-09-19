import { execFileSync } from 'node:child_process'
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// #7180: a global pr-shepherd shadowed the workspace install on PATH. Keep only Vouchington's
// workspace-pinning and local-guidance contracts here — package command behavior belongs upstream
// as a rule.
//
// The stack-escalation assertions below are the deliberate, narrow exception: they pin *Vouchington's
// procedure assumptions about upstream behavior* (the stacked-prs skill and git-and-prs.md both
// state, as fact, that every ready stacked layer terminates as `ESCALATE`/`stacked-pr` rather than
// `MERGE`, and give an exact exit-code map; and that per-PR ready-delay state is isolated, so
// concurrent single-PR shepherds on different stack layers never reset each other's timer). The
// 0.47→0.50 rot that motivated this whole plan was exactly this kind of undetected drift at a caret
// bump, so those claims need a version-drift guard too — not to test pr-shepherd's own correctness,
// but to catch the moment its behavior no longer matches what our docs promise. A failure here means:
// re-verify the stack procedure in .agents/skills/stacked-prs/SKILL.md and
// .agents/skills/agent-workflow/git-and-prs.md against the new installed behavior and update both the
// docs and this test — it is not a broken import to silently fix.
//
// The ownership-partition regex (stacked-prs/SKILL.md §A3) is a different kind of guard — our own
// documented `grep -E` one-liner, not upstream behavior — and is pinned separately in
// `dev/stacked-prs-ownership-contract.test.mts` to keep this file under the line-count limit.

const ROOT_URL = new URL('../', import.meta.url)
const ROOT_DIR = fileURLToPath(ROOT_URL)
const repoFile = (path: string): URL => new URL(path, ROOT_URL)

const INSTALLED_VERSION = (
  JSON.parse(readFileSync(repoFile('node_modules/pr-shepherd/package.json'), 'utf8')) as {
    version: string
  }
).version
const REVISIT_FOLLOWUPS_SKILL = readFileSync(
  repoFile('.agents/skills/revisit-followups/SKILL.md'),
  'utf8',
)
const TRUSTED_HOST_SHEPHERD_PROMPT = 'docs/prompts/automation/shepherd.md'
const CHECKED_IN_GUIDANCE = [
  ...globSync('.agents/skills/**/*.md', { cwd: ROOT_DIR }),
  ...globSync('docs/**/*.md', { cwd: ROOT_DIR }),
].map(path => ({ path, text: readFileSync(repoFile(path), 'utf8') }))
const LOCAL_GUIDANCE = CHECKED_IN_GUIDANCE.filter(
  ({ path }) => path !== TRUSTED_HOST_SHEPHERD_PROMPT,
)

const DEPRECATED_INVOCATIONS =
  /\b(?:pnpm exec )?pr-shepherd\s+(?:poll|resolve|journal(?!\s+extract(?:\s|$))|commit-suggestion|mark-files-as-viewed|log-file|clean)\b/u
const BARE_LOCAL_COMMAND =
  /`pr-shepherd\s+(?:iterate|apply|journal|build-suggestion-patch(?:es)?|admin|<(?:pr|N|pr-number)>|\d+)(?:\s+[^`\n]+)?`|```(?:bash|sh|zsh|shell)?\n(?:(?!```)[^\n]*\n)*? {0,3}pr-shepherd\s+(?:iterate|apply|journal|build-suggestion-patch(?:es)?|admin|<(?:pr|N|pr-number)>|\d+)(?:\s+[^\n]+)?(?=\n|$)/u

function runCli(args: string[]): string {
  return execFileSync('pnpm', ['exec', 'pr-shepherd', ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    timeout: 15_000,
  })
}

describe('pr-shepherd consumer contracts', () => {
  it('resolves `pnpm exec pr-shepherd` to the workspace-installed binary', () => {
    expect(runCli(['--version']).trim()).toBe(INSTALLED_VERSION)
  })

  it('extracts a typed Shepherd Journal through the workspace CLI', () => {
    const fixtureDir = mkdtempSync(join(ROOT_DIR, '.pr-shepherd-cli-contract-'))
    const bodyFile = join(fixtureDir, 'body.md')

    try {
      writeFileSync(
        bodyFile,
        '<details>\n<summary>Shepherd Journal</summary>\n\n- Moved upstream.\n</details>\n',
      )

      expect(JSON.parse(runCli(['journal', 'extract', '--body-file', bodyFile]))).toEqual({
        journal: { entries: ['- Moved upstream.'], format: 'details' },
        ok: true,
      })
    } finally {
      rmSync(fixtureDir, { recursive: true })
    }
  })

  it('keeps local guidance workspace-pinned and on the current journal commands', () => {
    const divergentGuidance = LOCAL_GUIDANCE.filter(({ text }) =>
      BARE_LOCAL_COMMAND.test(text),
    ).map(({ path }) => path)
    const deprecatedGuidance = CHECKED_IN_GUIDANCE.filter(({ text }) =>
      DEPRECATED_INVOCATIONS.test(text),
    ).map(({ path }) => path)

    expect(divergentGuidance).toEqual([])
    expect(deprecatedGuidance).toEqual([])
    expect(REVISIT_FOLLOWUPS_SKILL).toContain(
      'pnpm exec pr-shepherd journal extract --body-file <path>',
    )
    expect(
      DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd journal extract --body-file body.md'),
    ).toBe(false)
    expect(DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd journal extraction body.md')).toBe(
      true,
    )
    expect(DEPRECATED_INVOCATIONS.test('pnpm exec pr-shepherd journal extract-old body.md')).toBe(
      true,
    )
    expect(DEPRECATED_INVOCATIONS.test("pnpm exec pr-shepherd journal 42 '- note'")).toBe(true)
  })
})

/**
 * Deep-imports installed pr-shepherd's pure decision functions by absolute file URL — the package
 * `exports` map exposes only `.`, `./mcp`, `./classify`, `./journal`, none of which reach these. A
 * `MODULE_NOT_FOUND` here means an upstream refactor moved or removed the file; that is treated as
 * the intended loud failure (see the comment at the top of this file), not silently patched over.
 */
async function importPureModule<T>(relativePath: string, forWhat: string): Promise<T> {
  try {
    return (await import(repoFile(`node_modules/pr-shepherd/${relativePath}`).href)) as T
  } catch (error) {
    throw new Error(
      `pr-shepherd@${INSTALLED_VERSION} moved, removed, or changed the shape of ` +
        `${relativePath} (needed for ${forWhat}). Re-verify the stack procedure in ` +
        '.agents/skills/stacked-prs/SKILL.md and .agents/skills/agent-workflow/git-and-prs.md ' +
        `against the new installed behavior, then update this test. Original error: ${String(error)}`,
      { cause: error },
    )
  }
}

describe('pr-shepherd stack-escalation contract (version-drift guard)', () => {
  it('routes a ready stacked layer to escalate/stacked-pr, and a non-stacked one to merge', async () => {
    const { buildReadyMergeOutcome } = await importPureModule<{
      buildReadyMergeOutcome: (
        enabled: boolean,
        readyElapsed: boolean,
        base: Record<string, unknown>,
        report: Record<string, unknown>,
      ) => { action: string; escalate?: { triggers: string[] } }
    }>('bin/commands/iterate/merge-state.mjs', 'the stacked-escalate route')

    const baseReport = {
      headSha: 'a'.repeat(40),
      nodeId: 'node-1',
      pr: 1,
      repo: 'owner/repo',
    }

    const stackedOutcome = buildReadyMergeOutcome(
      true,
      true,
      {},
      {
        ...baseReport,
        mergeStatus: {
          isDraft: false,
          mergeRequirements: {
            stack: { baseRefName: 'main', number: 5, position: 1, size: 2 },
          },
        },
      },
    )
    expect(stackedOutcome.action).toBe('escalate')
    expect(stackedOutcome.escalate?.triggers).toEqual(['stacked-pr'])

    const unstackedOutcome = buildReadyMergeOutcome(
      true,
      true,
      {},
      {
        ...baseReport,
        mergeStatus: { isDraft: false, mergeRequirements: {} },
      },
    )
    expect(unstackedOutcome.action).toBe('merge')
  })

  it('routes an aggregate `--merge --stack` poll on a stacked row to fix_code, not appears-ready', async () => {
    const { routePollSummary } = await importPureModule<{
      routePollSummary: (
        raw: Record<string, unknown>,
        checks: Record<string, unknown>,
        review: Record<string, unknown>,
        opts: Record<string, unknown>,
      ) => { action: string; reasons: string[] }
    }>('bin/github/poll-summary-route.mjs', 'the aggregate ready-delay hazard')

    const raw = {
      isDraft: false,
      isInMergeQueue: false,
      mergeStateStatus: 'CLEAN',
      mergeable: 'MERGEABLE',
      stack: { number: 5, position: 1, size: 2 },
      state: 'OPEN',
    }
    const checks = { failing: 0, inProgress: 0 }
    const review = { actionable: 0 }

    const result = routePollSummary(raw, checks, review, { merge: true })
    expect(result).toEqual({ action: 'fix_code', reasons: ['authoritative-poll-required'] })

    // If this now reports `appears-ready`, poll-summary-route.mjs stopped intercepting the
    // aggregate stacked case — git-and-prs.md's "never run --stack while single-PR polls are in
    // flight" rule and stacked-prs.md's "why not just poll --stack" section can then be deleted.
    const nonStackedResult = routePollSummary({ ...raw, stack: undefined }, checks, review, {
      merge: true,
    })
    expect(nonStackedResult).toEqual({ action: 'merge', reasons: ['appears-ready'] })
  })

  it('maps every terminal action to the exit code the procedure docs assume', async () => {
    const { EXIT, iterateResultToExitCode } = await importPureModule<{
      EXIT: Record<string, number>
      iterateResultToExitCode: (result: { action: string; reason?: string }) => number | undefined
    }>('bin/exit-codes.mjs', 'the exit-code map')

    expect(EXIT.WAIT).toBe(10)
    expect(EXIT.MARK_READY).toBe(11)
    expect(EXIT.FIX_CODE).toBe(12)
    expect(EXIT.ESCALATE).toBe(13)
    expect(EXIT.CLOSED).toBe(14)
    expect(EXIT.MERGE).toBe(15)
    expect(EXIT.OK).toBe(0)

    expect(iterateResultToExitCode({ action: 'escalate' })).toBe(13)
    expect(iterateResultToExitCode({ action: 'merge' })).toBe(15)
    expect(iterateResultToExitCode({ action: 'fix_code' })).toBe(12)
    expect(iterateResultToExitCode({ action: 'wait' })).toBe(10)
    expect(iterateResultToExitCode({ action: 'mark_ready' })).toBe(11)
    // CANCEL is not a single exit code — only its `closed` reason maps to 14; `merged` and
    // `ready-delay-elapsed` both map to 0. Asserted separately so a doc claiming a bare
    // "cancel → 14" is caught as wrong.
    expect(iterateResultToExitCode({ action: 'cancel', reason: 'closed' })).toBe(14)
    expect(iterateResultToExitCode({ action: 'cancel', reason: 'merged' })).toBe(0)
    expect(iterateResultToExitCode({ action: 'cancel', reason: 'ready-delay-elapsed' })).toBe(0)
  })

  it('keys ready-delay state per PR number, so concurrent single-PR shepherds do not reset each other', async () => {
    // stacked-prs.md and git-and-prs.md both claim, as fact, that shepherding every owned layer of
    // a stack with concurrent single-PR polls is safe because ready-delay state is isolated per PR
    // — never the aggregate `--stack` poll, which does collide (asserted above). That claim rests on
    // resolvePrStatePath keying the ready-since marker by PR number; if that key ever drops the PR
    // number, two concurrent layers would share one ready-delay timer and the concurrency claim in
    // both docs becomes false silently. A failure here means: re-verify "concurrent single-PR
    // shepherds on different PRs do not interfere" in both documents before updating this test.
    const { resolvePrStatePath } = await importPureModule<{
      resolvePrStatePath: (key: { owner: string; repo: string; pr: number | string }) => string
    }>('bin/state/base.mjs', 'the per-PR ready-delay state key')

    const key = { owner: 'owner', repo: 'repo' }
    const layer1Path = resolvePrStatePath({ ...key, pr: 111 })
    const layer2Path = resolvePrStatePath({ ...key, pr: 222 })

    expect(layer1Path).not.toBe(layer2Path)
    // Split on the path separator rather than substring-matching, so "111" is not a false-positive
    // match inside a longer number like "1112".
    expect(layer1Path.split(/[/\\]/)).toContain('111')
    expect(layer2Path.split(/[/\\]/)).toContain('222')
  })
})
