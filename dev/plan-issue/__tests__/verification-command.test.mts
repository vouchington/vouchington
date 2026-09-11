import { describe, expect, it } from 'vitest'

import { loadRepositoryCommandCatalog } from '../repository-command-catalog.mts'
import { VALID_PLAN_BODY } from '../test-helpers/valid-plan-body.mts'
import { validatePlanIssue } from '../validate.mts'

const DEFAULT_COMMAND = '`pnpm exec vitest run --project dev-tools`'

function withVerificationCommand(command: string): string {
  return VALID_PLAN_BODY.replace(DEFAULT_COMMAND, `\`${command}\``)
}

describe('Plan verification commands', () => {
  it('accepts a command that searches for TODO delimiters', () => {
    const body = VALID_PLAN_BODY.replace(
      '`pnpm exec vitest run --project dev-tools`',
      "`rg 'TODO:' src`",
    )
    expect(validatePlanIssue('Plan: search placeholder delimiters', body)).toEqual([])
  })

  it.each([
    'curl -fsS https://example.test/health',
    'aws sts get-caller-identity',
    'docker ps',
    'cd backend && curl -fsS http://localhost/health',
    "pnpm exec vitest -t 'rejects TODO placeholders'",
  ])('accepts executable shell structure: %s', command => {
    const body = VALID_PLAN_BODY.replace(
      '`pnpm exec vitest run --project dev-tools`',
      `\`${command}\``,
    )
    expect(validatePlanIssue('Plan: operational verification', body)).toEqual([])
  })

  it('rejects a bare executable name', () => {
    const body = VALID_PLAN_BODY.replace('`pnpm exec vitest run --project dev-tools`', '`curl`')
    expect(validatePlanIssue('Plan: incomplete verification', body).join('\n')).toContain(
      'code-formatted command',
    )
  })

  it.each(['mermaid', 'sql'])('rejects a non-shell %s code fence', language => {
    const body = VALID_PLAN_BODY.replace(
      '- `pnpm exec vitest run --project dev-tools`',
      `\`\`\`${language}\nflowchart LR\n\`\`\``,
    )
    expect(validatePlanIssue('Plan: non-shell verification', body).join('\n')).toContain(
      'code-formatted command',
    )
  })

  it('rejects standalone filler beside a valid verification command', () => {
    const body = VALID_PLAN_BODY.replace(
      '\n\n## Live browser preflight',
      '\n\nTODO\n\n## Live browser preflight',
    )
    expect(validatePlanIssue('Plan: verification filler', body).join('\n')).toContain(
      'Verification steps must not include standalone filler',
    )
  })

  it.each([
    ['pnpm run static-analysis', 'static-analysis'],
    ['pnpm exec vitest run --project tooling', 'tooling'],
    ['vitest run --project tooling', 'tooling'],
    ['pnpm exec vitest run --config ci/vitest.config.mts', 'ci/vitest.config.mts'],
    ['pnpm exec vitest run --config=ci/vitest.config.mts', 'ci/vitest.config.mts'],
    [
      'pnpm exec vitest run --project dev-tools --config ci/vitest.config.mts',
      'ci/vitest.config.mts',
    ],
    ['pnpm run static-analysis || pnpm run lint', 'static-analysis'],
    ['pnpm run static-analysis | cat', 'static-analysis'],
    ['./does-not-exist.sh', './does-not-exist.sh'],
    ['bash ./does-not-exist.sh', './does-not-exist.sh'],
    ['node missing/file.mts', 'missing/file.mts'],
    ['pnpm --dir missing-package build', 'build'],
    ['pnpm exec vitest run --project dev-tools && pnpm run static-analysis', 'static-analysis'],
  ])('rejects unresolved repository-owned command %s', (command, unresolved) => {
    expect(
      validatePlanIssue('Plan: unresolved verification', withVerificationCommand(command)).join(
        '\n',
      ),
    ).toContain(unresolved)
  })

  it.each([
    'pnpm exec vitest run --project dev-tools',
    'pnpm exec vitest run --project=dev-tools',
    'pnpm exec vitest run --project dev-tools | cat',
    'pnpm --dir web build',
    'pnpm --dir=web build',
    'pnpm --dir web run build',
    'pnpm --filter web run static-analysis',
    './ci/lint-links.sh --offline',
    'bash ci/lint-links.sh --offline',
    'node -e "console.log(1)"',
    'node --experimental-strip-types -e "console.log(1)"',
    'FOO=1 pnpm exec vitest run --project dev-tools',
    'vitest run --project dev-tools',
    'pnpm exec vitest run --project dev-tools dev/plan-issue/__tests__/not-created-yet.test.mts',
    'curl -fsS https://example.test/health',
  ])('accepts resolvable or non-repository-owned command %s', command => {
    expect(
      validatePlanIssue('Plan: resolvable verification', withVerificationCommand(command)),
    ).toEqual([])
  })

  it('loads live Vitest project names without treating the tooling group as a project', () => {
    const catalog = loadRepositoryCommandCatalog()
    expect(catalog.vitestProjects.has('dev-tools')).toBe(true)
    expect(catalog.vitestProjects.has('tooling')).toBe(false)
    expect(catalog.pathExists('../secret')).toBe(false)
    expect(catalog.scriptsIn('')?.has('lint')).toBe(true)
    expect(catalog.scriptsIn('')?.has('static-analysis')).toBe(false)
    expect(catalog.scriptsIn('no-such-package')).toBeUndefined()
  })

  it('accepts a fenced command after a comment line', () => {
    const body = VALID_PLAN_BODY.replace(
      '- `pnpm exec vitest run --project dev-tools`',
      '```sh\n# verify\npnpm exec vitest run --project dev-tools\n```',
    )
    expect(validatePlanIssue('Plan: fenced comment', body)).toEqual([])
  })

  it('uses an injected catalog instead of the live worktree', () => {
    const catalog = loadRepositoryCommandCatalog()
    const injected = { ...catalog, vitestProjects: new Set<string>() }
    expect(
      validatePlanIssue('Plan: injected catalog', VALID_PLAN_BODY, undefined, injected).join('\n'),
    ).toContain('dev-tools')
  })
})
