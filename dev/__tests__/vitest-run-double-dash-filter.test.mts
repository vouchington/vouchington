import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('backend focused-command docs stay pinned to supported filtering forms', () => {
  it('backend/agents/AGENTS.md does not duplicate focused commands', () => {
    const claudeMd = repoFile('backend/agents/AGENTS.md')

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
