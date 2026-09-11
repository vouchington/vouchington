import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('backend focused-command docs stay pinned to supported filtering forms', () => {
  it('backend/README.md documents aggregate pnpm filtering through the group runner', () => {
    const readme = repoFile('backend/README.md')
    const codeSpans = [...readme.matchAll(/`([^`]+)`/g)].map(match => match[1])

    const runScriptSpans = codeSpans.filter(span => span.startsWith('pnpm run test:backend'))
    expect(runScriptSpans.length).toBeGreaterThan(0)
    expect(runScriptSpans).toContain('pnpm run test:backend:default -- <files>')
    expect(codeSpans).toContain('pnpm exec vitest run --project backend-data-stores <file>')
  })

  it('backend/agents/README.md routes focused agent test commands to its reference section', () => {
    const readme = repoFile('backend/agents/README.md')

    expect(readme).toContain('[Tests](reference-tests.md)')

    const referenceTests = repoFile('backend/agents/reference-tests.md')
    const fencedBash = /```bash\n([\s\S]*?)```/.exec(referenceTests)
    expect(fencedBash).not.toBeNull()
    const commandBlock = fencedBash![1]

    expect(commandBlock).not.toContain(' -- ')
    expect(commandBlock).toContain(
      'pnpm exec vitest run --project backend-data-stores --project backend-mocks backend/agents/<agent-name>/',
    )
  })

  it('backend/agents/CLAUDE.md routes commands to the README without duplicating them', () => {
    const claudeMd = repoFile('backend/agents/CLAUDE.md')

    expect(claudeMd).toContain('[README.md](README.md)')
    expect(claudeMd).not.toContain('```bash')
    expect(claudeMd).not.toContain('--project backend-data-stores --project backend-mocks')
  })

  it('durable Vitest commands select projects instead of individual test files', () => {
    const packageScripts = JSON.parse(repoFile('package.json')) as {
      scripts: Record<string, string>
    }
    const durableCommands = [
      ...Object.entries(packageScripts.scripts)
        .filter(
          ([, command]) =>
            command.includes('vitest') || command.includes('run-vitest-project-group.mts'),
        )
        .map(([name, command]) => [`package.json#${name}`, command] as const),
      ['ci/coverage-local-affected.mts', repoFile('ci/coverage-local-affected.mts')] as const,
      ['ci/local-patch-coverage.mts', repoFile('ci/local-patch-coverage.mts')] as const,
    ]

    for (const [source, command] of durableCommands) {
      expect({
        source,
        hasDurableFileFilter:
          /(?:vitest|run-vitest-project-group\.mts)[^\n'"`]*\.(?:mock\.)?test\.(?:mts|ts|tsx)/.test(
            command,
          ),
      }).toEqual({ source, hasDurableFileFilter: false })
    }
  })
})
