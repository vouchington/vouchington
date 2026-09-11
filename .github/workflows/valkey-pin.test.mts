import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { assertWorkflowInvariant } from './workflow-test-helpers.mts'

const WORKFLOW_VALKEY_FILES = [
  '.github/workflows/build-backend.yml',
  '.github/workflows/checks-backend-smoke.yml',
  '.github/workflows/explain-analyze.yml',
  '.github/workflows/tests-backend-credentialed.yml',
  '.github/workflows/tests-backend-unit.yml',
  '.github/workflows/tests-playwright-credentialed.yml',
  '.github/workflows/tests-playwright.yml',
  '.github/workflows/tests-postgres-schema.yml',
  '.github/workflows/tests-web-integration.yml',
]

const DEV_VALKEY_FILES = ['dev/initialize', 'dev/initialize-tests/initialize-valkey.test.mts']

function valkeyRefs(file: string) {
  return [...readFileSync(file, 'utf8').matchAll(/valkey\/valkey-bundle:([^\s'"\\)]+)/g)].map(
    match => match[1],
  )
}

function workflowValkeyRef() {
  const workflowRefs = WORKFLOW_VALKEY_FILES.flatMap(file => {
    const fileRefs = valkeyRefs(file)
    assertWorkflowInvariant(fileRefs.length > 0, `Expected a Valkey image pin in ${file}`)
    return fileRefs
  })
  const uniqueWorkflowRefs = new Set(workflowRefs)
  assertWorkflowInvariant(uniqueWorkflowRefs.size === 1, 'Expected one shared Valkey workflow pin')
  const [workflowRef] = uniqueWorkflowRefs
  assertWorkflowInvariant(workflowRef, 'Expected the shared Valkey workflow pin')
  return workflowRef
}

describe('Valkey bundle image pin', () => {
  it('uses one digest-pinned workflow image and derives the local runtime version from it', () => {
    const workflowRef = workflowValkeyRef()
    expect(workflowRef).toMatch(/^\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/u)

    const workflowVersion = workflowRef.split('@', 1)[0]
    for (const file of DEV_VALKEY_FILES) {
      const refs = valkeyRefs(file)
      expect(refs.length).toBeGreaterThan(0)
      expect(new Set(refs)).toEqual(new Set([workflowVersion]))
    }
  })

  it('has a Renovate manager that updates the shared pin', () => {
    const renovate = JSON.parse(readFileSync('renovate.json', 'utf8')) as {
      customManagers?: Array<{
        datasourceTemplate?: string
        depNameTemplate?: string
        managerFilePatterns?: string[]
        matchStrings?: string[]
      }>
    }
    const manager = renovate.customManagers?.find(
      candidate => candidate.depNameTemplate === 'valkey/valkey-bundle',
    )
    assertWorkflowInvariant(manager, 'Expected the Valkey Renovate manager')
    expect(manager.datasourceTemplate).toBe('docker')
    for (const filePattern of [
      '.github/workflows/*.yml',
      '.github/workflows/*.yaml',
      '.github/workflows/*.test.mts',
      'dev/initialize',
      'dev/initialize-tests/*.test.mts',
    ]) {
      expect(manager.managerFilePatterns).toContain(filePattern)
    }

    const [matchString] = manager.matchStrings ?? []
    assertWorkflowInvariant(matchString, 'Expected the Valkey Renovate match expression')
    const workflowRef = workflowValkeyRef()
    const [currentValue, currentDigest] = workflowRef.split('@')
    assertWorkflowInvariant(currentValue && currentDigest, 'Expected a version and digest')
    const image = `valkey/valkey-bundle:${workflowRef}`
    expect(new RegExp(matchString, 'u').exec(image)?.groups).toMatchObject({
      currentDigest,
      currentValue,
    })
    const nextDigest = `sha256:${'b'.repeat(64)}`
    expect(image.replace(currentDigest, nextDigest)).toBe(
      `valkey/valkey-bundle:${currentValue}@${nextDigest}`,
    )
  })
})
