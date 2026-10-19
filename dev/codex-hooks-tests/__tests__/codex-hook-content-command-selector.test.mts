import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { contentRuleExemption } from '../../codex-hooks/policy/github-content-rule-scope.mts'
import { parseGhOrGhStackInvocation } from '../../codex-hooks/policy/github-invocation.mts'
import { findGitHubWorkflowBlock } from '../../codex-hooks/policy-helpers.mts'
import { tokenizeShellWordsDetailed } from '../../codex-hooks/policy/shell-tokenizer.mts'

const SESSION = { sessionRepositories: () => new Set(['acme/app']) }
const UNREAD_CWD = '/repository-scope-session'
const nonDraftPr = (flags: string) => `gh pr create ${flags} --title t --body "no refs"`

function reasonOf(command: string): string | undefined {
  return findGitHubWorkflowBlock(command, UNREAD_CWD, SESSION)?.reason
}

function issueCreateIsExempt(command: string): boolean {
  const words = tokenizeShellWordsDetailed(command)
  const tokens = words.map(word => word.value)
  const index = tokens.indexOf('gh')
  const invocation = parseGhOrGhStackInvocation(tokens, index)
  if (invocation === null) throw new Error('expected a gh invocation')
  return contentRuleExemption(words, SESSION, true)(invocation, index, UNREAD_CWD)
}

describe('GitHub content command selector', () => {
  beforeEach(() => {
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
    vi.stubEnv('GH_REPO', '')
    vi.stubEnv('GH_HOST', 'github.com')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('consumes documented PR create values, aliases, booleans, and attached values', () => {
    expect(
      reasonOf(
        nonDraftPr(
          '-Rwidgets-inc/tool -Hfeature -btext -Bmain -a@me -lbug -mrelease -pRoadmap -rteam/reviewer -Ttemplate.md --attach image.png --fill-verbose --dry-run --no-maintainer-edit',
        ),
      ),
    ).toBeUndefined()
    expect(
      reasonOf(
        'gh pr create --repo=widgets-inc/tool --head=feature --title=t --body=x --fill-first',
      ),
    ).toBeUndefined()
    expect(
      reasonOf(
        'gh pr create -R=widgets-inc/tool -H=feature -t=Title -b=body -d=false --dry-run=true --no-maintainer-edit=false',
      ),
    ).toBeUndefined()
  })

  it('keeps the PR content rule on for an unknown create flag before a foreign selector', () => {
    expect(reasonOf(nonDraftPr('--future-option -Rwidgets-inc/tool'))).toContain('pr_create')
  })

  it('scopes issue create using its documented options and inherited repository selector', () => {
    expect(
      issueCreateIsExempt(
        'gh issue create -Rwidgets-inc/tool -a@me --attach image.png --blocked-by 1,2 --blocking 3 -bbody -lbug -mrelease -pRoadmap --parent 4 -Ttemplate -tTitle --type=Bug -w',
      ),
    ).toBe(true)
    expect(
      issueCreateIsExempt(
        'gh issue create --repo=widgets-inc/tool --assignee=@me --body-file=body.md --title=Issue',
      ),
    ).toBe(true)
    expect(
      issueCreateIsExempt(
        'gh issue create --repo=widgets-inc/tool --parent=4 --type=Bug --web=false',
      ),
    ).toBe(true)
    expect(issueCreateIsExempt('gh -Rwidgets-inc/tool issue create --title=Issue')).toBe(true)
    expect(issueCreateIsExempt('gh issue create --repo=acme/app --title=Issue')).toBe(false)
    expect(
      issueCreateIsExempt('gh issue create --future-option -Rwidgets-inc/tool --title=Issue'),
    ).toBe(false)
  })

  it('consumes documented PR edit values and attached short forms', () => {
    expect(
      reasonOf('gh pr edit 5 -Rwidgets-inc/tool -btext -Bmain -mrelease -tNewTitle'),
    ).toBeUndefined()
    expect(reasonOf('gh pr edit 5 --repo=widgets-inc/tool -b=text -t=NewTitle')).toBeUndefined()
  })
})
