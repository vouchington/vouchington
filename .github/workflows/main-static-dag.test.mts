import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Job = { if?: string; needs?: string[] }
type Workflow = { jobs?: Record<string, Job> }

function workflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('main publication dependency DAG', () => {
  it('keeps publication workflows free of static and test jobs', () => {
    const expected = new Map<string, string[]>([
      [
        'main-backend.yml',
        ['backend-deploy-intent', 'detect-image-publication', 'publish-backend-images'],
      ],
      ['main-web.yml', ['detect-image-publication', 'publish-web-images', 'web-deploy-intent']],
      ['main-lambdas.yml', ['publish-image-resize']],
      ['main-cloudflare-worker.yml', ['publish-cloudflare-worker']],
      ['main-storybook.yml', ['publish-storybook']],
    ])

    for (const [file, jobs] of expected) {
      expect(Object.keys(workflow(`.github/workflows/${file}`).jobs ?? {}).toSorted()).toEqual(jobs)
    }
  })
})
