import { readFile } from 'node:fs/promises'

import { parse as load } from 'yaml'

import { describe, expect, it } from 'vitest'

type WorkflowJob = {
  needs?: string | string[]
  steps?: Array<{ name?: string; env?: Record<string, unknown> }>
}
type Workflow = { jobs: Record<string, WorkflowJob> }

// Each named step's `.result` exclusions are documented inline next to its hand-built RESULTS.
// A job may legitimately have multiple RESULTS templates with different scopes.
const WORKFLOWS: Record<string, Record<string, Record<string, string[]>>> = {}

async function loadWorkflow(file: string) {
  const raw = await readFile(file, 'utf8')
  return load(raw) as Workflow
}

function needsResultsKeys(resultsTemplate: string) {
  const keys = new Set<string>()
  const results = JSON.parse(resultsTemplate) as Record<string, Record<string, unknown>>
  for (const [jsonKey, fields] of Object.entries(results)) {
    const result = fields.result
    expect(result).toBeTypeOf('string')
    expect(/^\$\{\{\s*needs\.([a-zA-Z0-9_-]+)\.result\s*\}\}$/u.exec(result as string)?.[1]).toBe(
      jsonKey,
    )
    for (const field of Object.values(fields)) {
      if (typeof field !== 'string') continue
      for (const reference of field.matchAll(/\bneeds\.([a-zA-Z0-9_-]+)\./gu)) {
        // A mismatch here means a copy-pasted field references the wrong job.
        expect(reference[1]).toBe(jsonKey)
      }
    }
    keys.add(jsonKey)
  }
  return keys
}

function findResultsTemplates(job: WorkflowJob): Map<string, string> {
  const templates = new Map<string, string>()
  for (const step of job.steps ?? []) {
    const results = step.env?.RESULTS
    if (typeof results !== 'string' || !results.includes('needs.')) continue
    if (!step.name) throw new Error('A hand-built RESULTS step must have a stable name')
    if (templates.has(step.name)) {
      throw new Error(`Duplicate hand-built RESULTS step name: ${step.name}`)
    }
    templates.set(step.name, results)
  }
  return templates
}

describe.each(Object.keys(WORKFLOWS))('%s hand-built RESULTS stays in sync with needs:', file => {
  const expectedJobs = WORKFLOWS[file]

  it('has no unexpected hand-built RESULTS steps', async () => {
    const workflow = await loadWorkflow(file)
    const actual = new Set<string>()
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      for (const stepName of findResultsTemplates(job).keys()) actual.add(`${jobName}:${stepName}`)
    }
    const expected = new Set(
      Object.entries(expectedJobs).flatMap(([jobName, steps]) =>
        Object.keys(steps).map(stepName => `${jobName}:${stepName}`),
      ),
    )

    expect(actual.symmetricDifference(expected)).toEqual(new Set())
  })

  it.each(Object.keys(expectedJobs))('%s', async jobKey => {
    const workflow = await loadWorkflow(file)
    const job = workflow.jobs[jobKey]
    expect(job).toBeDefined()

    const declaredNeeds = Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : []
    const expectedSteps = expectedJobs[jobKey]
    const actualTemplates = findResultsTemplates(job)

    // Every hand-built RESULTS step is named in the contract, and every contracted step exists.
    expect(
      new Set(actualTemplates.keys()).symmetricDifference(new Set(Object.keys(expectedSteps))),
    ).toEqual(new Set())

    for (const [stepName, exclusions] of Object.entries(expectedSteps)) {
      const resultsTemplate = actualTemplates.get(stepName)
      expect(resultsTemplate).toBeDefined()

      const excluded = new Set(exclusions)
      const expectedKeys = new Set(declaredNeeds.filter(name => !excluded.has(name)))
      const actualKeys = needsResultsKeys(resultsTemplate as string)

      // Mismatch means this step's RESULTS drifted from needs or its documented exclusions.
      expect(actualKeys.symmetricDifference(expectedKeys)).toEqual(new Set())
    }
  })

  it('has no remaining toJSON(needs) fan-in gates', async () => {
    const raw = await readFile(file, 'utf8')
    const occurrences = raw.match(/RESULTS:\s*\$\{\{\s*toJSON\(needs\)\s*\}\}/g) ?? []
    expect(occurrences).toHaveLength(0)
  })
})

describe('extracted CI RESULTS hand-off', () => {
  it('keeps callers and callables on explicit compact RESULTS', async () => {
    const [ci, coverage, processing] = await Promise.all([
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/ci-test-coverage.yml', 'utf8'),
      readFile('.github/workflows/ci-tests-processing.yml', 'utf8'),
    ])
    expect(ci).toContain('results: |-')
    expect(ci).toContain('"tests-processing":{"result":"${{ needs.tests-processing.result }}"}')
    expect(ci).toContain('"tests":{"result":"${{ needs.tests.result }}"}')
    expect(coverage).toContain('RESULTS: |-')
    expect(processing).toContain('RESULTS: ${{ inputs.results }}')
  })
})
