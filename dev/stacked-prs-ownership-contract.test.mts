import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The ownership partition in .agents/skills/stacked-prs/SKILL.md §A3 ("shepherd only PRs this agent
// owns") is a documented `grep -E` one-liner, not a Vouchington function — there is nothing to
// deep-import, and no upstream package to drift under it (see dev/pr-shepherd-cli-contract.test.mts
// for that kind of guard). But the pattern is easy to get subtly wrong in a doc edit — an unescaped
// session id, a dropped anchor, a nonexistent capture group — so it is pinned here against realistic
// fixture bodies (shaped like the skill's own cited real examples, #11481 and #11479) instead of only
// being read by eye. A failure means: re-verify the ownership-partition contract in
// .agents/skills/stacked-prs/SKILL.md and update this test to match the new pattern.

const SKILL_PATH = '.agents/skills/stacked-prs/SKILL.md'
const SKILL_TEXT = readFileSync(fileURLToPath(new URL(`../${SKILL_PATH}`, import.meta.url)), 'utf8')

describe('stacked-prs ownership regex (doc contract)', () => {
  it('extracts the documented ownership grep pattern and classifies fixture PR bodies correctly', () => {
    const match = /grep -E '(\^Agent: .+\$)'/.exec(SKILL_TEXT)
    if (!match) {
      throw new Error(
        `${SKILL_PATH} no longer documents the ownership grep pattern as a single-quoted ` +
          "'grep -E ...' literal — re-verify the ownership-partition contract and update this test.",
      )
    }

    const mySessionId = 'abc123-my-session-id'
    const pattern = new RegExp(match[1].replace('<my-id>', mySessionId))
    const bodyIsOwned = (body: string): boolean => body.split('\n').some(line => pattern.test(line))

    // Owned — matches the skill's own cited real examples' shape (#11481: `Agent: grok session
    // 01a08514-…`), for both the "session" and "thread" (Codex) nouns, with and without a model.
    expect(bodyIsOwned(`## Summary\n\nAgent: grok session ${mySessionId}\n`)).toBe(true)
    expect(bodyIsOwned(`Agent: codex (gpt-5.1) thread ${mySessionId}`)).toBe(true)

    // Not owned — a different session id.
    expect(bodyIsOwned('Agent: grok session some-other-agents-session-id')).toBe(false)
    // Not owned — the Agent: line stripped entirely (no tooling-emitted provenance at all).
    expect(bodyIsOwned('## Summary\n\nNo provenance line here.\n')).toBe(false)
    // Not owned — the documented degrade case: harness resolved but no session id (#11479's real
    // shape: `Agent: codex`, no id).
    expect(bodyIsOwned('Agent: codex')).toBe(false)
  })
})
