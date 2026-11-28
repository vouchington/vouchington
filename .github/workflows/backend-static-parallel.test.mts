import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Job = { needs?: string | string[] }

const jobs = (
  load(readFileSync('.github/workflows/backend.yml', 'utf8')) as { jobs: Record<string, Job> }
).jobs
const needsOf = (id: string) => [jobs[id]?.needs ?? []].flat()

describe('backend static runs in parallel with the suites', () => {
  it('lets only the image jobs, the fan-ins and the cancel job wait for static-backend', () => {
    const dependents = Object.keys(jobs).filter(id => needsOf(id).includes('static-backend'))
    expect(dependents.toSorted()).toEqual([
      'backend',
      'cancel-static-backend',
      'coverage',
      'publish-backend-images',
      'validate-backend-images',
    ])
  })
})
