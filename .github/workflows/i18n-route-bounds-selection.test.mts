import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  jobs?: Record<
    string,
    {
      steps?: Array<{
        id?: string
        run?: string
      }>
    }
  >
}

const readYaml = async <T,>(path: string): Promise<T> => load(await readFile(path, 'utf8')) as T

describe('i18n route bounds CI selection', () => {
  it.each([
    {
      name: 'a full manual or nightly run',
      env: {
        FULL: 'true',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'false',
      },
      expected: 'true',
    },
    {
      name: 'a route-bounds input change',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'true',
      },
      expected: 'true',
    },
    {
      name: 'an ordinary tooling change',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'false',
        TOOLING: 'true',
      },
      expected: 'false',
    },
    {
      name: 'an unrelated code change',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'false',
      },
      expected: 'false',
    },
    {
      name: 'a docs-only change even if the raw path filter matched',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'true',
        WORKFLOW_ACTION_CHANGES: 'false',
        I18N_ROUTE_BOUNDS: 'true',
      },
      expected: 'false',
    },
    {
      name: 'a workflow or action change',
      env: {
        FULL: 'false',
        DOCS_ONLY: 'false',
        WORKFLOW_ACTION_CHANGES: 'true',
        I18N_ROUTE_BOUNDS: 'false',
      },
      expected: 'true',
    },
  ])('normalizes $name through the real area-selection shell step', async ({ env, expected }) => {
    const workflow = await readYaml<Workflow>('.github/workflows/ci-detect-changes.yml')
    const job = workflow.jobs?.['detect-changes']
    const step = job?.steps?.find(candidate => candidate.id === 'areas')
    expect(step?.run).toBeDefined()

    const scratch = await mkdtemp(join(tmpdir(), 'i18n-route-bounds-selection-'))
    try {
      const outputPath = join(scratch, 'github-output')
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', step!.run!], {
        env: {
          ...process.env,
          GITHUB_OUTPUT: outputPath,
          BACKEND: 'false',
          WEB: 'false',
          CLOUDFLARE_WORKER: 'false',
          LAMBDAS: 'false',
          TOOLING: 'false',
          ...env,
        },
        stdio: 'pipe',
      })
      const outputs = Object.fromEntries(
        (await readFile(outputPath, 'utf8'))
          .trim()
          .split('\n')
          .map(line => line.split('=')),
      )
      expect(outputs['i18n-route-bounds']).toBe(expected)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })
})
