import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const read = (path: string) => readFileSync(path, 'utf8')
const firstPartyGhcrPaths = ['.github/workflows/ghcr-cleanup.yml', 'ci/ghcr-package-retention.sh']
const activeValidationSourcePaths = [
  '.github/workflows/build-backend.yml',
  '.github/workflows/build-web.yml',
  'backend/docker-bake.hcl',
  'ci/exec-vouchington-gha.sh',
]
const forbiddenRegistryReferences = ['ghcr.io/', 'type=registry']

function validationSourceViolations(path: string, source: string): string[] {
  const violations = forbiddenRegistryReferences
    .filter(reference => source.includes(reference))
    .map(reference => `${path}: ${reference}`)

  if (/docker\/login-action|docker login/u.test(source)) violations.push(`${path}: registry login`)
  if (/ghcr-cleanup|ghcr-package-retention/u.test(source)) {
    violations.push(`${path}: first-party GHCR cleanup`)
  }

  if (!path.endsWith('.yml')) return violations

  const pending: unknown[] = [parseYaml(source)]
  while (pending.length > 0) {
    const value = pending.pop()
    if (Array.isArray(value)) {
      pending.push(...value)
      continue
    }
    if (value === null || typeof value !== 'object') continue

    const record = value as Record<string, unknown>
    if (
      record.with !== null &&
      typeof record.with === 'object' &&
      Object.hasOwn(record.with, 'push')
    ) {
      const push = (record.with as Record<string, unknown>).push
      if (push !== false && push !== 'false') violations.push(`${path}: image push`)
    }
    if (record.permissions === 'write-all') violations.push(`${path}: package write permission`)
    if (
      record.permissions !== null &&
      typeof record.permissions === 'object' &&
      (record.permissions as Record<string, unknown>).packages === 'write'
    ) {
      violations.push(`${path}: package write permission`)
    }
    pending.push(...Object.values(record))
  }

  return violations
}

describe('validation image invariants', () => {
  it.each(['backend', 'web'] as const)(
    'builds %s validation images under a transfer-invariant local namespace with immutable SHA tags',
    workspace => {
      const workflow = read(`.github/workflows/build-${workspace}.yml`)

      expect(workflow).toContain('IMAGE_REPOSITORY: voucha-validation')
      for (const image of workspace === 'backend' ? ['api', 'worker-cpu', 'worker-io'] : ['web']) {
        expect(workflow).toContain(`images: \${{ env.IMAGE_REPOSITORY }}/${image}`)
      }
      expect(workflow).toContain('SHA_TAG: sha-${{ github.sha }}')
      expect(workflow).toContain('IMAGE_TAG: ${{ env.SHA_TAG }}')
    },
  )

  it('keeps backend validation outputs and caches local to its BuildKit daemon', () => {
    const bake = read('backend/docker-bake.hcl')

    expect(bake).toContain('output = ["type=docker"]')
    expect(bake).not.toContain('cache-from')
    expect(bake).not.toContain('cache-to')
  })

  it('keeps the web validation image local while using only its GHA cache', () => {
    const workflow = read('.github/workflows/build-web.yml')

    expect(workflow).toContain('type=gha,scope=web-arm64')
    expect(workflow).toContain('cache-to: type=gha,scope=web-arm64,mode=max')
  })

  it.each([
    [
      'accepts a GHA cache',
      '.github/workflows/build-web.yml',
      'cache-from: type=gha,scope=web-arm64',
      [],
    ],
    [
      'rejects a personal GHCR cache',
      '.github/workflows/build-web.yml',
      'cache-from: type=registry,ref=ghcr.io/jonathanong/filaments/web:buildcache-arm64',
      [
        '.github/workflows/build-web.yml: ghcr.io/',
        '.github/workflows/build-web.yml: type=registry',
      ],
    ],
    [
      'rejects a dynamic registry declaration',
      '.github/workflows/build-web.yml',
      'cache-from: type=registry,ref=ghcr.io/${{ github.repository }}/web:buildcache-arm64',
      [
        '.github/workflows/build-web.yml: ghcr.io/',
        '.github/workflows/build-web.yml: type=registry',
      ],
    ],
    [
      'rejects quoted image push',
      '.github/workflows/build-web.yml',
      "steps:\n  - with:\n      push: 'true'",
      ['.github/workflows/build-web.yml: image push'],
    ],
    [
      'rejects expression-valued image push',
      '.github/workflows/build-web.yml',
      'steps:\n  - with:\n      push: ${{ github.ref == github.event.repository.default_branch }}',
      ['.github/workflows/build-web.yml: image push'],
    ],
    [
      'accepts a literal disabled image push',
      '.github/workflows/build-web.yml',
      "steps:\n  - with:\n      push: 'false'",
      [],
    ],
    [
      'rejects registry login',
      '.github/workflows/build-web.yml',
      'steps:\n  - uses: docker/login-action@synthetic-ref',
      ['.github/workflows/build-web.yml: registry login'],
    ],
    [
      'rejects quoted package write permission',
      '.github/workflows/build-web.yml',
      "permissions:\n  packages: 'write'",
      ['.github/workflows/build-web.yml: package write permission'],
    ],
    [
      'rejects write-all permission',
      '.github/workflows/build-web.yml',
      'permissions: write-all',
      ['.github/workflows/build-web.yml: package write permission'],
    ],
  ])('%s', (_description, path, source, expected) => {
    expect(validationSourceViolations(path, source)).toEqual(expected)
  })

  it('has no registry declaration in active validation sources', () => {
    const sources = Object.fromEntries(activeValidationSourcePaths.map(path => [path, read(path)]))

    expect(
      Object.entries(sources).flatMap(([path, source]) => validationSourceViolations(path, source)),
    ).toEqual([])
  })

  it('has no first-party GHCR retention automation', () => {
    for (const path of firstPartyGhcrPaths) expect(existsSync(path)).toBe(false)
    expect(read('ci/exec-vouchington-gha.sh')).not.toContain('ghcr-package-retention')
  })
})
