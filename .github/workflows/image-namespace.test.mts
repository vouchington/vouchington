import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const read = (path: string) => readFileSync(path, 'utf8')
const firstPartyGhcrPaths = ['.github/workflows/ghcr-cleanup.yml', 'ci/ghcr-package-retention.sh']
// publish-backend-images.yml and publish-web-images.yml are deliberately absent. Since
// vouchington/vouchington-infra#274 they publish the deployable backend and web images to GHCR on
// main; their narrower invariants live in the "backend image publication" and "web image
// publication" blocks below. build-backend.yml, build-web.yml, and the composite actions they
// delegate to remain pure validation sources -- everything listed here must still keep its output
// and caches local to its own BuildKit daemon.
const activeValidationSourcePaths = [
  '.github/workflows/build-backend.yml',
  '.github/actions/build-backend-images/action.yml',
  '.github/workflows/build-web.yml',
  '.github/actions/build-web-images/action.yml',
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

// build-backend.yml and build-web.yml only set up the job env and delegate the actual image
// builds to their composite actions, so each workspace's invariants are checked against both
// files concatenated rather than the workflow file alone.
const workspaceValidationSource = (workspace: 'backend' | 'web') =>
  read(`.github/workflows/build-${workspace}.yml`) +
  read(`.github/actions/build-${workspace}-images/action.yml`)

describe('validation image invariants', () => {
  it.each(['backend', 'web'] as const)(
    'builds %s validation images under a transfer-invariant local namespace with immutable SHA tags',
    workspace => {
      const workflow = workspaceValidationSource(workspace)

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
    const workflow = workspaceValidationSource('web')

    expect(workflow).toContain('type=gha,scope=web-arm64')
    expect(workflow).toContain('cache-to: type=gha,scope=web-arm64,mode=max')
  })

  // Every case below targets the same file; only the violation suffixes vary.
  const buildWebPath = '.github/workflows/build-web.yml'
  it.each([
    ['accepts a GHA cache', 'cache-from: type=gha,scope=web-arm64', []],
    [
      'rejects a personal GHCR cache',
      'cache-from: type=registry,ref=ghcr.io/jonathanong/filaments/web:buildcache-arm64',
      ['ghcr.io/', 'type=registry'],
    ],
    [
      'rejects a dynamic registry declaration',
      'cache-from: type=registry,ref=ghcr.io/${{ github.repository }}/web:buildcache-arm64',
      ['ghcr.io/', 'type=registry'],
    ],
    ['rejects quoted image push', "steps:\n  - with:\n      push: 'true'", ['image push']],
    [
      'rejects expression-valued image push',
      'steps:\n  - with:\n      push: ${{ github.ref == github.event.repository.default_branch }}',
      ['image push'],
    ],
    ['accepts a literal disabled image push', "steps:\n  - with:\n      push: 'false'", []],
    [
      'rejects registry login',
      'steps:\n  - uses: docker/login-action@synthetic-ref',
      ['registry login'],
    ],
    [
      'rejects quoted package write permission',
      "permissions:\n  packages: 'write'",
      ['package write permission'],
    ],
    ['rejects write-all permission', 'permissions: write-all', ['package write permission']],
  ] as const)('%s', (_description, source, expectedSuffixes) => {
    expect(validationSourceViolations(buildWebPath, source)).toEqual(
      expectedSuffixes.map(suffix => `${buildWebPath}: ${suffix}`),
    )
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

type CallerJob = { uses?: string; permissions?: Record<string, string> }

// Generic caller/callee wiring (one caller apiece, matching permissions) is enforced by
// workflow-topology-policy-callers.mts and workflow-permissions-audit.mts. What those checks don't
// say is which *specific* callee may hold the GHCR write credential -- that's pinned down here.
function reusableCallers(calleePath: string): { id: string; job: CallerJob }[] {
  return readdirSync('.github/workflows')
    .filter(file => file.endsWith('.yml'))
    .flatMap(file => {
      const parsed = parseYaml(read(`.github/workflows/${file}`)) as {
        jobs?: Record<string, CallerJob>
      }
      return Object.entries(parsed.jobs ?? {})
        .filter(([, job]) => job?.uses === calleePath)
        .map(([id, job]) => ({ id: `${file}#${id}`, job }))
    })
}

// backend and web share the identical build-locally-then-publish-from-the-daemon shape, pinned
// down by one parameterized suite instead of two near-duplicate `describe` blocks.
// `orderedCompositeSteps` is the exact gate sequence: smoke test(s) leading into the Trivy scan,
// asserted as strictly increasing step indexes.
const imagePublicationCases = [
  {
    workspace: 'backend',
    buildWorkflowPath: '.github/workflows/build-backend.yml',
    compositeActionPath: '.github/actions/build-backend-images/action.yml',
    publishWorkflowPath: '.github/workflows/publish-backend-images.yml',
    publishStepName: 'Publish validated backend images to GHCR',
    orderedCompositeSteps: [
      'Run API smoke test',
      'Run worker-cpu smoke test',
      'Scan OS packages in images with Trivy',
    ],
    noCacheInBuildSources: true,
    mainCallerId: 'main-backend.yml#publish-backend-images',
  },
  {
    workspace: 'web',
    buildWorkflowPath: '.github/workflows/build-web.yml',
    compositeActionPath: '.github/actions/build-web-images/action.yml',
    publishWorkflowPath: '.github/workflows/publish-web-images.yml',
    publishStepName: 'Publish validated web image to GHCR',
    orderedCompositeSteps: ['Run Docker smoke test', 'Scan OS packages in web image with Trivy'],
    noCacheInBuildSources: false,
    mainCallerId: 'main-web.yml#publish-web-images',
  },
] as const

describe.each(imagePublicationCases)('$workspace image publication', config => {
  const buildSource = read(config.buildWorkflowPath)
  const compositeActionSource = read(config.compositeActionPath)
  const publishSource = read(config.publishWorkflowPath)
  const compositeAction = parseYaml(compositeActionSource) as {
    runs?: { steps?: { name?: string }[] }
  }
  const compositeSteps = compositeAction.runs?.steps ?? []
  const compositeStepIndex = (name: string) => compositeSteps.findIndex(step => step?.name === name)
  const publishWorkflow = parseYaml(publishSource) as {
    jobs?: Record<string, { steps?: { name?: string; uses?: string; if?: string }[] }>
  }
  const publishSteps = publishWorkflow.jobs?.build?.steps ?? []
  const publishStepIndex = publishSteps.findIndex(step => step?.name === config.publishStepName)
  const buildActionStepIndex = publishSteps.findIndex(
    step => step?.uses === `./.github/actions/build-${config.workspace}-images`,
  )

  it('keeps the build itself local and pushes from the daemon afterwards', () => {
    // A `type=registry` output would upload before any check in the job had run, so what reaches
    // the registry must instead be what was already tested.
    for (const source of [buildSource, compositeActionSource]) {
      expect(source).not.toContain('type=registry')
    }
  })

  it('gates the composite action on the smoke test(s) and the Trivy scan, in order', () => {
    let previousIndex = -1
    for (const stepName of config.orderedCompositeSteps) {
      const index = compositeStepIndex(stepName)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }
  })

  it('publishes only after the composite action that runs the smoke test(s) and the Trivy gate', () => {
    expect(buildActionStepIndex).toBeGreaterThan(-1)
    expect(publishStepIndex).toBeGreaterThan(-1)
    expect(publishStepIndex).toBeGreaterThan(buildActionStepIndex)
  })

  it('gates publication on an explicit success check', () => {
    // Explicit, not GitHub's implicit success(): a failed smoke test must never reach a registry.
    const condition = publishSteps[publishStepIndex]?.if ?? ''
    expect(condition).toContain('success()')
  })

  it('never grants packages: write to a build workflow caller', () => {
    const callers = reusableCallers(`./${config.buildWorkflowPath}`)

    expect(callers.length).toBeGreaterThan(0)
    expect(
      callers.filter(({ job }) => job.permissions?.packages === 'write').map(({ id }) => id),
    ).toEqual([])
  })

  it('has exactly one caller of the publish workflow, and it grants packages: write', () => {
    const callers = reusableCallers(`./${config.publishWorkflowPath}`)

    expect(callers.map(({ id }) => id)).toEqual([config.mainCallerId])
    expect(callers[0]?.job.permissions?.packages).toBe('write')
  })

  it('publishes only into the repository owner namespace', () => {
    // The original incident was a personal GHCR namespace (ghcr.io/jonathanong/...); every
    // registry reference must stay owner-derived, never a hardcoded account.
    expect(publishSource).toContain('ghcr.io/${{ github.repository_owner }}')
    const foreign = /ghcr\.io\/(?!\$\{\{ github\.repository_owner \}\})/u.exec(publishSource)
    expect(foreign).toBeNull()
  })
})

describe('image publication build cache', () => {
  // Only backend's build sources are also asserted free of a BuildKit cache -- see "keeps backend
  // validation outputs and caches local to its BuildKit daemon" above.
  it.each(imagePublicationCases.filter(config => config.noCacheInBuildSources))(
    'keeps $workspace build sources free of a BuildKit cache',
    ({ buildWorkflowPath, compositeActionPath }) => {
      for (const source of [read(buildWorkflowPath), read(compositeActionPath)]) {
        expect(source).not.toContain('cache-from')
        expect(source).not.toContain('cache-to')
      }
    },
  )
})
