import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { assertWorkflowInvariant } from '../test-helpers/workflow-fixtures.mts'

const WORKFLOW_VALKEY_FILES = ['.github/actions/start-valkey/action.yml']

const DEV_VALKEY_FILES = ['dev/initialize']

function valkeyRefs(file: string) {
  return [
    ...readFileSync(file, 'utf8').matchAll(
      /ghcr\.io\/vouchington\/dependency-valkey:([^\s'"\\)]+)/g,
    ),
  ].map(match => match[1])
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

describe('reviewed dependency image pins', () => {
  it('uses one reviewed digest-pinned image in CI and local initialization', () => {
    const workflowRef = workflowValkeyRef()
    expect(workflowRef).toMatch(/^\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/u)

    for (const file of DEV_VALKEY_FILES) {
      const refs = valkeyRefs(file)
      expect(refs.length).toBeGreaterThan(0)
      expect(new Set(refs)).toEqual(new Set([workflowRef]))
    }
  })

  it('has a Renovate manager that updates the shared pin', () => {
    const renovate = JSON.parse(readFileSync('renovate.json', 'utf8')) as {
      customManagers?: Array<{
        datasourceTemplate?: string
        description?: string
        managerFilePatterns?: string[]
        matchStrings?: string[]
      }>
    }
    const manager = renovate.customManagers?.find(
      candidate =>
        candidate.description === 'Reviewed GHCR dependency images used by CI and local tools',
    )
    assertWorkflowInvariant(manager, 'Expected the GHCR dependency Renovate manager')
    expect(manager.datasourceTemplate).toBe('docker')
    for (const filePattern of [
      '.github/workflows/*.yml',
      '.github/actions/*/action.yml',
      'dev/initialize',
      'dev/otel/compose.yaml',
    ]) {
      expect(manager.managerFilePatterns).toContain(filePattern)
    }

    const [matchString] = manager.matchStrings ?? []
    assertWorkflowInvariant(matchString, 'Expected the GHCR Renovate match expression')
    const workflowRef = workflowValkeyRef()
    const [currentValue, currentDigest] = workflowRef.split('@')
    assertWorkflowInvariant(currentValue && currentDigest, 'Expected a version and digest')
    const image = `ghcr.io/vouchington/dependency-valkey:${workflowRef}`
    expect(new RegExp(matchString, 'u').exec(image)?.groups).toMatchObject({
      depName: 'ghcr.io/vouchington/dependency-valkey',
      currentDigest,
      currentValue,
    })
    const nextDigest = `sha256:${'b'.repeat(64)}`
    expect(image.replace(currentDigest, nextDigest)).toBe(
      `ghcr.io/vouchington/dependency-valkey:${currentValue}@${nextDigest}`,
    )
    for (const pkg of ['pgvector', 'buildkit', 'otel']) {
      const entry = (
        JSON.parse(readFileSync('ci/dependency-mirror/images.json', 'utf8')) as {
          images: Array<{ package: string; tag: string; digest: string }>
        }
      ).images.find(candidate => candidate.package === `dependency-${pkg}`)
      assertWorkflowInvariant(entry, `Expected the ${pkg} inventory entry`)
      expect(
        new RegExp(matchString, 'u').exec(
          `ghcr.io/vouchington/${entry.package}:${entry.tag}@${entry.digest}`,
        )?.groups,
      ).toMatchObject({
        depName: `ghcr.io/vouchington/${entry.package}`,
        currentValue: entry.tag,
        currentDigest: entry.digest,
      })
    }
  })

  it('updates Dockerfile frontend digests from the verified GHCR tag', () => {
    const renovate = JSON.parse(readFileSync('renovate.json', 'utf8')) as {
      customManagers?: Array<{
        description?: string
        managerFilePatterns?: string[]
        matchStrings?: string[]
      }>
    }
    const manager = renovate.customManagers?.find(
      candidate =>
        candidate.description === 'Dockerfile frontend copied to reviewed GHCR dependency package',
    )
    assertWorkflowInvariant(manager, 'Expected the Dockerfile frontend Renovate manager')
    expect(manager.managerFilePatterns).toEqual(['backend/Dockerfile', 'web/Dockerfile'])
    const pattern = manager.matchStrings?.[0]
    assertWorkflowInvariant(pattern, 'Expected the Dockerfile frontend matcher')
    // The inventory may already approve a newer digest while the consumer PR is still pending.
    for (const file of manager.managerFilePatterns ?? []) {
      const source = readFileSync(file, 'utf8')
      const groups = new RegExp(pattern, 'u').exec(source)?.groups
      expect(groups).toMatchObject({
        depName: 'ghcr.io/vouchington/dependency-dockerfile',
      })
      expect(groups?.currentValue).toMatch(/^[A-Za-z0-9_.-]+$/u)
      expect(groups?.currentDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    }
  })

  it('updates only the secondary web Node stage missed by the first-FROM updater', () => {
    const renovate = JSON.parse(readFileSync('renovate.json', 'utf8')) as {
      customManagers?: Array<{
        description?: string
        managerFilePatterns?: string[]
        matchStrings?: string[]
      }>
    }
    const manager = renovate.customManagers?.find(
      candidate => candidate.description === 'Secondary Alpine Node stage in the web Dockerfile',
    )
    assertWorkflowInvariant(manager, 'Expected the secondary web Node Renovate manager')
    expect(manager.managerFilePatterns).toEqual(['web/Dockerfile'])
    const pattern = manager.matchStrings?.[0]
    assertWorkflowInvariant(pattern, 'Expected the secondary web Node matcher')
    const matches = [...readFileSync('web/Dockerfile', 'utf8').matchAll(new RegExp(pattern, 'gu'))]
    expect(matches).toHaveLength(1)
    expect(matches[0]?.groups).toMatchObject({
      depName: 'ghcr.io/vouchington/dependency-node',
    })
    expect(matches[0]?.groups?.currentValue).toMatch(/^[0-9]+-alpine$/u)
    expect(matches[0]?.groups?.currentDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
  })

  it('updates only the backend Distroless runtime stage', () => {
    const renovate = JSON.parse(readFileSync('renovate.json', 'utf8')) as {
      customManagers?: Array<{
        datasourceTemplate?: string
        description?: string
        managerFilePatterns?: string[]
        matchStrings?: string[]
      }>
    }
    const manager = renovate.customManagers?.find(
      candidate =>
        candidate.description === 'Secondary Distroless runtime stage in the backend Dockerfile',
    )
    assertWorkflowInvariant(manager, 'Expected the backend Distroless Renovate manager')
    expect(manager.managerFilePatterns).toEqual(['backend/Dockerfile'])
    expect(manager.datasourceTemplate).toBe('docker')
    const pattern = manager.matchStrings?.[0]
    assertWorkflowInvariant(pattern, 'Expected the backend Distroless matcher')
    const matcher = new RegExp(pattern, 'gu')
    const matches = [...readFileSync('backend/Dockerfile', 'utf8').matchAll(matcher)]
    expect(matches).toHaveLength(1)
    expect(matches[0]?.groups).toMatchObject({
      depName: 'ghcr.io/vouchington/dependency-distroless-nodejs',
      currentValue: 'nonroot',
    })
    expect(matches[0]?.groups?.currentDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect('FROM base-node AS builder').not.toMatch(new RegExp(pattern, 'u'))
  })
})
