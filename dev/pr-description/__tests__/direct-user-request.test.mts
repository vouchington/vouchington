import { describe, expect, it } from 'vitest'

import { findGitHubWorkflowBlock } from '../../codex-hooks/policy/github-workflow.mts'
import { VALID_PROVENANCE_BLOCK } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { validatePrBody, validatePrBodyWithIssueReferences } from '../validate.mts'

const DIRECT_REQUEST_PAIR =
  'No source issue; direct user request.\n<!-- related-issues-validation: no-source-direct-request -->'
const BODY = `## Summary

Implement the requested cleanup.

## Impact

Developers can publish an interactive request without a source issue; product behavior is unchanged.

## Related issues

${DIRECT_REQUEST_PAIR}

Workspace setup: ./dev/initialize monorepo
${VALID_PROVENANCE_BLOCK}
`

describe('direct user request without a source issue', () => {
  it('accepts the representation interactively without a plan heading or issue lookup', async () => {
    const result = await validatePrBodyWithIssueReferences(
      BODY,
      async () => {
        throw new Error('No closing references to resolve')
      },
      { automationContext: false },
    )
    expect(result.ok).toBe(true)
    expect(
      findGitHubWorkflowBlock(
        `gh pr create --draft --title "chore: cleanup" --body '${BODY}'`,
        process.cwd(),
        { automationContext: false },
      ),
    ).toBeNull()
  })

  it.each([
    ['missing visible line', DIRECT_REQUEST_PAIR.split('\n')[1]],
    ['missing marker', DIRECT_REQUEST_PAIR.split('\n')[0]],
    ['misspelled marker', DIRECT_REQUEST_PAIR.replace('no-source-direct', 'no-source-indirect')],
    ['fenced example', `~~~md\n${DIRECT_REQUEST_PAIR}\n~~~`],
    ['indented code', DIRECT_REQUEST_PAIR.replaceAll(/^/gm, '    ')],
    ['quoted example', DIRECT_REQUEST_PAIR.replaceAll(/^/gm, '> ')],
    ['hidden example', `<div>\n${DIRECT_REQUEST_PAIR}\n</div>`],
    ['intervening example', DIRECT_REQUEST_PAIR.replace('\n', '\n~~~md\nexample\n~~~\n')],
  ])('rejects a %s in validator and hook', (_name, replacement) => {
    const body = BODY.replace(DIRECT_REQUEST_PAIR, replacement ?? '')
    expect(validatePrBody(body, { automationContext: false }).ok).toBe(false)
    expect(
      findGitHubWorkflowBlock(`gh pr edit 123 --body '${body}'`, process.cwd(), {
        automationContext: false,
      }),
    ).not.toBeNull()
  })

  it('requires the pair in the Related issues section', () => {
    const body = BODY.replace(DIRECT_REQUEST_PAIR, '').replace('## Summary', DIRECT_REQUEST_PAIR)
    expect(validatePrBody(body, { automationContext: false }).ok).toBe(false)
  })

  it('retains existing non-closing related-reference semantics', async () => {
    const result = await validatePrBodyWithIssueReferences(
      `${BODY}\nRefs #456: related work remains open.`,
      async () => {
        throw new Error('A non-closing related reference does not become a source issue')
      },
      { automationContext: false },
    )
    expect(result.ok).toBe(true)
  })

  it.each([undefined, true])('rejects the representation with automationContext=%s', context => {
    expect(validatePrBody(BODY, { automationContext: context }).ok).toBe(false)
    expect(
      findGitHubWorkflowBlock(`gh pr edit 123 --body '${BODY}'`, process.cwd(), {
        automationContext: context,
      })?.reason,
    ).toContain('interactive')
  })

  it('cannot declare the tool call interactive through command text', () => {
    expect(
      findGitHubWorkflowBlock(
        `CI=false GITHUB_ACTIONS=false gh pr edit 123 --body '${BODY}'`,
        process.cwd(),
        { automationContext: true },
      )?.reason,
    ).toContain('interactive')
  })

  it.each(['closed', 'unchecked', 'missing', 'pull request'])(
    'still rejects a supplied %s closing reference',
    async condition => {
      const body = BODY.replace(DIRECT_REQUEST_PAIR, `${DIRECT_REQUEST_PAIR}\nCloses #123`)
      const result = await validatePrBodyWithIssueReferences(
        body,
        async () =>
          condition === 'missing'
            ? { error: 'not found', ok: false }
            : {
                issue: {
                  body: condition === 'unchecked' ? '- [ ] remaining' : '',
                  isPullRequest: condition === 'pull request',
                  number: 123,
                  state: condition === 'closed' ? 'closed' : 'open',
                  title: 'Supplied reference',
                  url: 'https://github.com/owner/repo/issues/123',
                },
                ok: true,
              },
        { automationContext: false },
      )
      expect(result.ok).toBe(false)
      expect(result.errors.join('\n')).toContain('#123')
    },
  )

  it('rejects the representation in automation even alongside a closing reference', () => {
    const body = `${BODY}\nCloses #123`
    expect(validatePrBody(body, { automationContext: true }).ok).toBe(false)
    expect(
      findGitHubWorkflowBlock(`gh pr edit 123 --body '${body}'`, process.cwd(), {
        automationContext: true,
      })?.reason,
    ).toContain('interactive')
  })
})
