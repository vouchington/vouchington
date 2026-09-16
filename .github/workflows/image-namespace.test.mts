import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const read = (path: string) => readFileSync(path, 'utf8')
const firstPartyGhcrPaths = ['.github/workflows/ghcr-cleanup.yml', 'ci/ghcr-package-retention.sh']
// build-backend.yml is deliberately absent. Since vouchington/vouchington-infra#274 it is no
// longer a pure validation source: on main it also publishes the deployable backend images to
// GHCR. Its narrower invariants live in the "backend image publication" block below. Everything
// listed here must still keep its output and caches local to its own BuildKit daemon.
const activeValidationSourcePaths = [
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

  it('ships first-party GHCR retention automation', () => {
    // This assertion used to be inverted: it required these files to be absent, back when
    // nothing here published to GHCR at all. Publishing one image per component per main
    // revision makes reaping them mandatory, so their absence is now the defect.
    //
    // The ban this replaced is not simply gone. What it was actually written against -- a
    // personal GHCR namespace and a registry-backed build cache -- is still forbidden, by
    // validationSourceViolations above and by the publication invariants below.
    for (const path of firstPartyGhcrPaths) expect(existsSync(path)).toBe(true)
  })
})

describe('backend image publication', () => {
  const source = read('.github/workflows/build-backend.yml')
  const workflow = parseYaml(source) as {
    jobs?: Record<string, { steps?: { name?: string; if?: string }[] }>
  }
  const steps = workflow.jobs?.build?.steps ?? []
  const stepIndex = (name: string) => steps.findIndex(step => step?.name === name)
  const publishStepName = 'Publish validated backend images to GHCR'

  it('keeps the build itself local and pushes from the daemon afterwards', () => {
    // A `type=registry` output would upload before a single check in the job had run. The
    // images are built locally, validated, and only then pushed -- so what reaches the
    // registry is what was tested.
    expect(source).not.toContain('type=registry')
    expect(source).not.toContain('cache-from')
    expect(source).not.toContain('cache-to')
  })

  it('publishes only after the smoke tests and the Trivy gate', () => {
    const publish = stepIndex(publishStepName)
    expect(publish).toBeGreaterThan(-1)
    for (const gate of [
      'Run API smoke test',
      'Run worker-cpu smoke test',
      'Scan OS packages in images with Trivy',
    ]) {
      const gateIndex = stepIndex(gate)
      expect(gateIndex, `${gate} must exist`).toBeGreaterThan(-1)
      expect(publish, `publication must follow ${gate}`).toBeGreaterThan(gateIndex)
    }
  })

  it('gates publication on the publish input and an explicit success check', () => {
    const condition = steps[stepIndex(publishStepName)]?.if ?? ''
    expect(condition).toContain('inputs.publish')
    // Explicit rather than relying on GitHub implicitly ANDing success() into a condition that
    // carries no status function: a failed smoke test must never reach a registry.
    expect(condition).toContain('success()')
  })

  it('is published by the main-branch caller alone', () => {
    // Publication is gated twice over, and both gates are checked here rather than trusted:
    // a caller must pass `publish: true` *and* grant `packages: write`. The pull-request
    // callers do neither, so a validation run cannot reach a registry.
    type Job = { uses?: string; with?: Record<string, unknown>; permissions?: Record<string, string> }
    const callers = readdirSync('.github/workflows')
      .filter(file => file.endsWith('.yml'))
      .flatMap(file => {
        const parsed = parseYaml(read(`.github/workflows/${file}`)) as { jobs?: Record<string, Job> }
        return Object.entries(parsed.jobs ?? {})
          .filter(([, job]) => job?.uses === './.github/workflows/build-backend.yml')
          .map(([id, job]) => ({ id: `${file}#${id}`, job }))
      })

    expect(callers.length, 'build-backend.yml must have callers').toBeGreaterThan(0)

    const publishing = callers.filter(({ job }) => job.with?.publish === true)
    expect(publishing.map(({ id }) => id)).toEqual(['main-backend.yml#publish-backend-images'])

    for (const { id, job } of callers) {
      const grantsPackagesWrite = job.permissions?.packages === 'write'
      expect(grantsPackagesWrite, `${id} packages: write`).toBe(job.with?.publish === true)
    }
  })

  it('publishes only into the repository owner namespace', () => {
    // The incident behind the original ban was a personal GHCR namespace
    // (ghcr.io/jonathanong/...). Every registry reference must be owner-derived, never a
    // hardcoded account.
    expect(source).toContain('ghcr.io/${{ github.repository_owner }}')
    const foreign = /ghcr\.io\/(?!\$\{\{ github\.repository_owner \}\})/u.exec(source)
    expect(foreign, `foreign GHCR namespace: ${foreign?.[0]}`).toBeNull()
  })
})
