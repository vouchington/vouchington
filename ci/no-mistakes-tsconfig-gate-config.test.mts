import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type Config = {
  checks?: {
    commands?: Array<{ always?: boolean; command?: string[]; fileArgs?: string; name?: string }>
  }
  rules?: Array<{ name?: string; options?: unknown; rule?: string; scope?: string }>
}

describe('TypeScript compiler gate configuration', () => {
  it('declares every compiler project as an always-on static generic command', () => {
    const config = parseYaml(readFileSync(`${repoRoot}/.no-mistakes.yml`, 'utf8')) as Config
    const commands = config.checks?.commands ?? []
    const projects: Array<[string, string[]]> = [
      [
        'typecheck-backend',
        ['pnpm', 'exec', 'tsc', '--noEmit', '--incremental', '--project', 'backend/tsconfig.json'],
      ],
      [
        'typecheck-backend-email',
        [
          'pnpm',
          'exec',
          'tsc',
          '--noEmit',
          '--incremental',
          '--project',
          'email-templates/tsconfig.json',
        ],
      ],
      [
        'typecheck-web',
        ['bash', '-c', 'cd web && pnpm exec next typegen && pnpm exec tsc --noEmit --incremental'],
      ],
      [
        'typecheck-lambdas',
        ['pnpm', 'exec', 'tsc', '--noEmit', '--incremental', '--project', 'lambdas/tsconfig.json'],
      ],
      [
        'typecheck-cloudflare-worker',
        [
          'pnpm',
          'exec',
          'tsc',
          '--noEmit',
          '--incremental',
          '--project',
          'cloudflare-worker/tsconfig.json',
        ],
      ],
      [
        'typecheck-scripts',
        ['pnpm', 'exec', 'tsc', '--noEmit', '--incremental', '--project', 'tsconfig.json'],
      ],
      [
        'typecheck-ts-shared',
        [
          'pnpm',
          'exec',
          'tsc',
          '--noEmit',
          '--incremental',
          '--project',
          'ts-shared/tsconfig.json',
        ],
      ],
      [
        'typecheck-playwright',
        [
          'pnpm',
          'exec',
          'tsc',
          '--noEmit',
          '--incremental',
          '--project',
          'playwright/tsconfig.json',
        ],
      ],
      [
        'typecheck-test-helpers',
        [
          'pnpm',
          'exec',
          'tsc',
          '--noEmit',
          '--incremental',
          '--project',
          'test-helpers/tsconfig.json',
        ],
      ],
      [
        'typecheck-integration-tests',
        [
          'pnpm',
          'exec',
          'tsc',
          '--noEmit',
          '--incremental',
          '--project',
          'integration-tests/tsconfig.json',
        ],
      ],
    ]

    expect(commands).toHaveLength(projects.length)
    for (const [name, command] of projects) {
      expect(commands).toContainEqual({
        always: true,
        command,
        fileArgs: 'none',
        name,
      })
    }
    expect(config.rules).toContainEqual({
      name: 'TypeScript compiler gate coverage',
      options: {
        allowProjects: {
          'web/tsconfig.dependency-cruiser.json':
            'Used only by dependency-cruiser, not as a compiler program.',
        },
      },
      rule: 'tsconfig-gate-coverage',
      scope: 'repository',
    })
  })
})
