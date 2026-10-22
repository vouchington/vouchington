import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  jobs?: Record<string, unknown>
}

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('attempt-scoped artifact cleanup fan-ins', () => {
  it('keeps validation and main publication workflows outside the writable immediate cleanup path', () => {
    for (const area of [
      'static',
      'backend',
      'web',
      'cloudflare-worker',
      'lambdas',
      'tooling',
      'main-backend',
      'main-web',
      'main-cloudflare-worker',
      'main-lambdas',
      'main-storybook',
    ]) {
      expect(readWorkflow(`.github/workflows/${area}.yml`).jobs).not.toHaveProperty(
        'cleanup-artifacts',
      )
    }
  })
})
