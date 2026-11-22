import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

type Job = { needs?: string | string[]; if?: string }

const source = readFileSync('.github/workflows/backend.yml', 'utf8')
const jobs = (load(source) as { jobs: Record<string, Job> }).jobs
const needsOf = (id: string) => [jobs[id]?.needs ?? []].flat()
const selected = "needs.changes.outputs.area-backend == 'true'"

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

  it('starts every suite from change detection or the prepared database', () => {
    expect(needsOf('static-backend')).toEqual(['changes'])
    for (const id of ['typecheck-bun', 'prepare-postgres', 'test-backend-modules']) {
      expect([id, needsOf(id), jobs[id]?.if]).toEqual([id, ['changes'], selected])
    }
    for (const id of ['test-backend-unit', 'test-postgres-schema', 'test-explain-analyze']) {
      expect([id, needsOf(id)]).toEqual([id, ['prepare-postgres']])
    }
    expect(needsOf('backend-smoke')).toEqual(['changes', 'prepare-postgres'])
    expect(needsOf('test-backend-credentialed')).toEqual(['changes', 'prepare-postgres'])
  })

  it('still requires static-backend for the backend gate', () => {
    expect(needsOf('backend')).toContain('static-backend')
    expect(source).toContain('"static-backend":{"result":"${{ needs.static-backend.result }}"}')
  })
})
