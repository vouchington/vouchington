import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// #7180: a global pr-shepherd shadowed the workspace install on PATH. This guards Vouchington's own
// guidance: checked-in docs and skills invoke the workspace-pinned CLI and no retired subcommands.
// pr-shepherd's command behavior, exit codes, and routing belong to its own tests and skill.

const ROOT_URL = new URL('../../', import.meta.url)
const ROOT_DIR = fileURLToPath(ROOT_URL)
const repoFile = (path: string): URL => new URL(path, ROOT_URL)

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

describe('pr-shepherd guidance', () => {
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
