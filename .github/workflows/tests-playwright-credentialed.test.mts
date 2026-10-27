import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const credentialedWorkflowText = readFileSync(
  '.github/workflows/tests-playwright-credentialed.yml',
  'utf8',
)

describe('credentialed Playwright command', () => {
  it.each([7, 124, 130, 143])(
    'bounds the credentialed command and preserves status %i',
    commandExit => {
      const workflow = load(credentialedWorkflowText) as {
        jobs: Record<
          string,
          {
            'timeout-minutes': number
            steps: Array<{ id?: string; run?: string; 'timeout-minutes'?: number }>
          }
        >
      }
      const job = workflow.jobs['playwright-credentialed-tests']!
      const step = job.steps.find(candidate => candidate.id === 'run-playwright-credentialed')!
      const directory = mkdtempSync(join(tmpdir(), 'credentialed-bounded-step-'))
      try {
        mkdirSync(join(directory, 'node_modules'))
        symlinkSync(
          join(process.cwd(), 'node_modules/vouchington-tooling'),
          join(directory, 'node_modules/vouchington-tooling'),
          'dir',
        )
        const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], {
          encoding: 'utf8',
          timeout: 5000,
        })
        expect(python.status).toBe(0)
        writeFileSync(
          join(directory, 'python3'),
          [
            '#!/usr/bin/env bash',
            'printf \'%s\\n\' "$@" > "$BOUND_ARGS"',
            'exec "$REAL_PYTHON" "$@"',
          ].join('\n'),
        )
        writeFileSync(
          join(directory, 'pnpm'),
          [
            '#!/usr/bin/env bash',
            'printf \'%s\\n\' "$@" > "$PLAYWRIGHT_ARGS"',
            `exit ${commandExit}`,
          ].join('\n'),
        )
        writeFileSync(join(directory, 'date'), '#!/usr/bin/env bash\nprintf "1000000\\n"\n')
        chmodSync(join(directory, 'date'), 0o755)
        chmodSync(join(directory, 'python3'), 0o755)
        chmodSync(join(directory, 'pnpm'), 0o755)
        const result = spawnSync('bash', ['-c', step.run!], {
          cwd: directory,
          encoding: 'utf8',
          timeout: 5000,
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH ?? ''}`,
            GITHUB_WORKSPACE: directory,
            GITHUB_OUTPUT: join(directory, 'outputs'),
            CREDENTIALED_JOB_DEADLINE_EPOCH: String(1_000_000 + 780),
            REAL_PYTHON: python.stdout.trim(),
            BOUND_ARGS: join(directory, 'bounded-args'),
            PLAYWRIGHT_ARGS: join(directory, 'playwright-args'),
          },
        })
        expect(result.error).toBeUndefined()
        expect(result.status).toBe(commandExit)
        expect(existsSync(join(directory, 'bounded-args'))).toBe(true)
        expect(readFileSync(join(directory, 'bounded-args'), 'utf8').trim().split('\n')).toEqual([
          join(directory, 'node_modules/vouchington-tooling/scripts/run-bounded.py'),
          '420',
          'pnpm',
          'exec',
          './ci/with-node-test-options',
          'playwright',
          'test',
          '--config',
          'playwright.credentialed.config.mts',
        ])
        expect(readFileSync(join(directory, 'playwright-args'), 'utf8').trim().split('\n')).toEqual(
          [
            'exec',
            './ci/with-node-test-options',
            'playwright',
            'test',
            '--config',
            'playwright.credentialed.config.mts',
          ],
        )
        expect(readFileSync(join(directory, 'outputs'), 'utf8')).toBe('retried=false\n')
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
})
