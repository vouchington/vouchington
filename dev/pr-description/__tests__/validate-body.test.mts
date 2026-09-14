import { describe, expect, it } from 'vitest'
import { GITHUB_BODY_MAX_CHARACTERS, validateGitHubBodyLength } from 'vouchington-tooling/gh-cli'

import {
  VALID_PR_BODY as VALID_BODY,
  VALID_PROVENANCE_BLOCK,
} from '../../test-helpers/pr-description/valid-pr-body.mts'
import { validatePrBody } from '../validate.mts'

function withoutSection(body: string, sectionHeading: string): string {
  const lines = body.split('\n')
  const index = lines.findIndex(line => line.trim() === sectionHeading)
  if (index === -1) return body
  let end = lines.findIndex((line, lineIndex) => lineIndex > index && line.startsWith('## '))
  if (end === -1) end = lines.length
  return lines
    .filter((_, lineIndex) => lineIndex < index || lineIndex >= end)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

function bodyAtLength(length: number): string {
  const currentLength = validateGitHubBodyLength(VALID_BODY).characterCount
  return `${VALID_BODY}${'x'.repeat(length - currentLength)}`
}

describe('validatePrBody', () => {
  it('accepts a valid PR body', () => {
    expect(validatePrBody(VALID_BODY)).toEqual({ errors: [], ok: true, referencedIssues: [] })
  })

  it('accepts a body at GitHub’s limit', () => {
    expect(validatePrBody(bodyAtLength(GITHUB_BODY_MAX_CHARACTERS)).ok).toBe(true)
  })

  it('reports the character and UTF-8 byte counts one character over GitHub’s limit', () => {
    expect(validatePrBody(bodyAtLength(GITHUB_BODY_MAX_CHARACTERS + 1)).errors.join('\n')).toMatch(
      /65,537 Unicode characters.*65,537 UTF-8 bytes.*65,536/,
    )
  })

  it('reports missing required sections together', () => {
    const result = validatePrBody('## Summary\n\nNo related issues or workspace setup.\n')
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'PR body must include a "## Related issues" section (e.g. a heading followed by "Closes #123"). See .agents/skills/agent-workflow/git-and-prs.md.',
    )
    expect(result.errors).toContain(
      'PR body must include a "Workspace setup:" line (e.g. "Workspace setup: ./dev/initialize monorepo"). See .agents/skills/agent-workflow/start-of-work.md.',
    )
  })

  it('rejects a body with no Related issues heading', () => {
    const result = validatePrBody(withoutSection(VALID_BODY, '## Related issues'))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'PR body must include a "## Related issues" section (e.g. a heading followed by "Closes #123"). See .agents/skills/agent-workflow/git-and-prs.md.',
    )
  })

  it('rejects a body with no Workspace setup line', () => {
    const result = validatePrBody(VALID_BODY.replace('Workspace setup:', 'Setup:'))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'PR body must include a "Workspace setup:" line (e.g. "Workspace setup: ./dev/initialize monorepo"). See .agents/skills/agent-workflow/start-of-work.md.',
    )
  })

  it.each(['Refs #123', 'Closes \\#123'])(
    'rejects a Related issues section without a closing keyword: %s',
    reference => {
      const result = validatePrBody(VALID_BODY.replace('Closes #123', reference))
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'PR body must include at least one GitHub closing keyword (e.g. "Closes #123") in the "## Related issues" section, or the exact scheduled-prompt no-source representation, or the exact Fix Main interim-classifier no-closing-ref representation alongside a Refs entry. See .agents/skills/agent-workflow/git-and-prs.md.',
      )
    },
  )

  it.each(['Fixes #1', 'Resolves #1', 'Closed #1', 'Fixed #1', 'Resolved #1'])(
    'accepts closing keyword: %s',
    reference => {
      expect(validatePrBody(VALID_BODY.replace('Closes #123', reference)).ok).toBe(true)
    },
  )

  it.each(['closes #1', 'CLOSES #1', 'Closes #1'])(
    'accepts case-insensitive closing keyword: %s',
    reference => {
      expect(validatePrBody(VALID_BODY.replace('Closes #123', reference)).ok).toBe(true)
    },
  )

  it('accepts Refs alongside a closing reference', () => {
    expect(validatePrBody(VALID_BODY.replace('Closes #123', 'Closes #123\nRefs #456')).ok).toBe(
      true,
    )
  })

  it('rejects a closing keyword outside Related issues', () => {
    const body = `## Summary\n\nCloses #999\n\n## Related issues\n\nRefs #123\n\nWorkspace setup: ./dev/initialize monorepo\n${VALID_PROVENANCE_BLOCK}\n`
    expect(validatePrBody(body).errors.join(' ')).toContain('"## Related issues" section')
  })

  it('accepts cross-repository closing references', () => {
    expect(validatePrBody(VALID_BODY.replace('Closes #123', 'Closes owner/repo#123')).ok).toBe(true)
  })
})
