// Interim: remove once jonathanong/no-mistakes#2182 ships the generic rule.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../test-helpers/workflow-fixtures.mts'

// Anonymous Docker Hub pulls from hosted runners hit its rate limit and ejected unrelated
// merge-queue entries (#2653). `mirror.gcr.io` serves the same pinned digest without credentials.
// The Valkey helper (`start-valkey/pull-image.sh`) is a shell script, not a workflow body, so its
// documented one-shot Docker Hub fallback is outside this scan.
const HUB_HOSTS = ['docker.io', 'index.docker.io', 'registry-1.docker.io']
const VALUE_FLAGS = new Set(
  '-e --env -p --publish -v --volume --name --network --net --add-host --entrypoint -u --user -w --workdir --tmpfs --platform --mount --label -l --env-file --health-cmd --health-interval --health-retries --health-timeout --health-start-period -m --memory --cpus --restart --cap-add --cap-drop --shm-size --log-driver --ulimit -h --hostname --pull --pids-limit --group-add --device --dns --ipc --pid --cgroupns --stop-signal --stop-timeout'.split(
    ' ',
  ),
)

type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown> }
type Document = {
  jobs?: Record<
    string,
    {
      container?: string | { image?: string }
      services?: Record<string, { image?: string }>
      steps?: Step[]
    }
  >
  runs?: { steps?: Step[]; image?: string }
}

function isHubImage(reference: string): boolean {
  const image = reference.replace(/^["']|["'),;]+$/gu, '')
  if (image === '' || image === 'scratch') return false
  // Only the part before a variable is knowable; a wholly dynamic reference or registry is not.
  const dynamicAt = image.search(/\$|\{\{/u)
  const known = dynamicAt === -1 ? image : image.slice(0, dynamicAt)
  if (known === '') return false
  if (dynamicAt !== -1 && !known.includes('/') && image.slice(dynamicAt).includes('/')) return false
  const [first = ''] = known.split('/')
  if (!known.includes('/')) return true
  if (HUB_HOSTS.includes(first)) return true
  return !(first.includes('.') || first.includes(':') || first === 'localhost')
}

const GLOBAL_VALUE_OPTIONS = new Set(
  '--config --context -c --host -H --log-level -l --tlscacert --tlscert --tlskey'.split(' '),
)

function dockerCommandImages(script: string): string[] {
  const logical = script.replace(/\\\r?\n/gu, ' ')
  return [...logical.matchAll(/\bdocker\s+([^\n;&|]*)/gu)].flatMap(([, command]) => {
    const tokens = command!.match(/(?:[^\s"']|"[^"]*"|'[^']*')+/gu) ?? []
    let i = 0
    while (tokens[i]?.startsWith('-')) i += GLOBAL_VALUE_OPTIONS.has(tokens[i]!) ? 2 : 1
    if (tokens[i] === 'container' || tokens[i] === 'image') i++
    if (!['run', 'pull', 'create'].includes(tokens[i] ?? '')) return []
    for (i++; i < tokens.length; i++) {
      const token = tokens[i]!
      if (!token.startsWith('-')) return [token]
      if (VALUE_FLAGS.has(token)) i++
    }
    return []
  })
}

function stepImages(step: Step): string[] {
  const driverOptions = step.with?.['driver-opts']
  const driverImage = /(?:^|[\s,])image=(\S+)/u.exec(
    typeof driverOptions === 'string' ? driverOptions : '',
  )
  // setup-buildx-action's docker-container driver defaults to moby/buildkit from Docker Hub.
  const driver = step.with?.driver
  const defaultsToHub =
    step.uses?.startsWith('docker/setup-buildx-action') === true &&
    !driverImage &&
    (driver === undefined || driver === 'docker-container')
  return [
    ...dockerCommandImages(step.run ?? ''),
    ...(driverImage ? [driverImage[1]!] : []),
    ...(defaultsToHub ? ['moby/buildkit'] : []),
    ...(step.uses?.startsWith('docker://') ? [step.uses.slice('docker://'.length)] : []),
  ]
}

function workflowImageViolations(path: string, document: Document): string[] {
  const found: Array<[string, string]> = []
  for (const [jobId, job] of Object.entries(document.jobs ?? {})) {
    const container = typeof job.container === 'string' ? job.container : job.container?.image
    if (container) found.push([`${jobId} container`, container])
    for (const [name, service] of Object.entries(job.services ?? {})) {
      if (service.image) found.push([`${jobId} service ${name}`, service.image])
    }
    for (const step of job.steps ?? []) {
      found.push(...stepImages(step).map((image): [string, string] => [jobId, image]))
    }
  }
  const actionImage = document.runs?.image
  if (actionImage?.startsWith('docker://')) {
    found.push(['action image', actionImage.slice('docker://'.length)])
  }
  for (const step of document.runs?.steps ?? []) {
    found.push(...stepImages(step).map((image): [string, string] => ['composite', image]))
  }
  return found
    .filter(([, image]) => isHubImage(image))
    .map(([where, image]) => `${path}#${where}: ${image} must come from mirror.gcr.io/`)
}

function dockerfileViolations(path: string, source: string): string[] {
  const stages = new Set<string>()
  const violations: string[] = []
  const syntax = /^#\s*syntax\s*=\s*(\S+)/imu.exec(source)?.[1]
  if (syntax && isHubImage(syntax)) violations.push(`${path}: # syntax=${syntax}`)
  for (const line of source.replace(/\\\r?\n/gu, ' ').split('\n')) {
    const copyFrom = /^\s*COPY\s+(?:--\S+\s+)*--from=(\S+)/iu.exec(line)?.[1]
    if (copyFrom && !/^\d+$/u.test(copyFrom) && !stages.has(copyFrom.toLowerCase())) {
      if (isHubImage(copyFrom)) violations.push(`${path}: COPY --from=${copyFrom}`)
    }
    const from = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/iu.exec(line)
    if (!from) continue
    if (!stages.has(from[1]!.toLowerCase()) && isHubImage(from[1]!)) {
      violations.push(`${path}: FROM ${from[1]}`)
    }
    if (from[2]) stages.add(from[2].toLowerCase())
  }
  return violations
}

const isDockerfilePath = (path: string): boolean =>
  /(?:^|\/)(?:Dockerfile(?:\.[^/]+)?|[^/]+\.Dockerfile)$/u.test(path)

const trackedFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0')
    .filter(Boolean)

const dockerfilePaths = (): string[] => trackedFiles().filter(isDockerfilePath)

describe('Docker Hub images come through mirror.gcr.io', () => {
  it('flags Docker Hub references in every workflow image position', () => {
    const document: Document = {
      jobs: {
        build: {
          container: 'node',
          services: { db: { image: 'pgvector/pgvector' }, ok: { image: 'ghcr.io/o/i' } },
          steps: [
            { run: 'docker run -d --name x -e A=b -p 127.0.0.1::80 otel/collector' },
            { run: 'docker pull \\\n  docker.io/library/redis' },
            { uses: 'docker://alpine', with: {} },
            { uses: 'docker/setup-buildx-action', with: {} },
            { uses: 'docker/setup-buildx-action', with: { driver: 'docker-container' } },
            { run: 'docker image pull ubuntu' },
            { run: 'docker container create --name y busybox' },
            { run: 'docker run --platform "$PLATFORM" ubuntu' },
            { run: 'docker --context default pull alpine' },
            { run: 'docker --config "$DIR" image pull busybox' },
            { run: 'docker pull node:${{ matrix.version }}' },
            { run: 'docker pull --platform=linux/arm64 debian' },
            {
              uses: 'docker/setup-buildx-action',
              with: { 'driver-opts': 'image=moby/buildkit' },
            },
          ],
        },
      },
    }

    expect(workflowImageViolations('wf', document).map(entry => entry.split(': ')[1])).toEqual([
      'node must come from mirror.gcr.io/',
      'pgvector/pgvector must come from mirror.gcr.io/',
      'otel/collector must come from mirror.gcr.io/',
      'docker.io/library/redis must come from mirror.gcr.io/',
      'alpine must come from mirror.gcr.io/',
      'moby/buildkit must come from mirror.gcr.io/',
      'moby/buildkit must come from mirror.gcr.io/',
      'ubuntu must come from mirror.gcr.io/',
      'busybox must come from mirror.gcr.io/',
      'ubuntu must come from mirror.gcr.io/',
      'alpine must come from mirror.gcr.io/',
      'busybox must come from mirror.gcr.io/',
      'node:${{ must come from mirror.gcr.io/',
      'debian must come from mirror.gcr.io/',
      'moby/buildkit must come from mirror.gcr.io/',
    ])
    expect(
      dockerfileViolations(
        'Dockerfile',
        '# syntax=docker/dockerfile\nFROM node AS a\nFROM a AS b\nFROM node:${NODE_VERSION}\nCOPY --chown=1 --from=nginx /x /y\nCOPY --from=a /x /y\nCOPY --from=0 /x /y\n',
      ),
    ).toEqual([
      'Dockerfile: # syntax=docker/dockerfile',
      'Dockerfile: FROM node',
      'Dockerfile: FROM node:${NODE_VERSION}',
      'Dockerfile: COPY --from=nginx',
    ])
    expect(
      workflowImageViolations('action.yml', { runs: { image: 'docker://alpine' } }).map(
        entry => entry.split(': ')[1],
      ),
    ).toEqual(['alpine must come from mirror.gcr.io/'])
    expect(workflowImageViolations('action.yml', { runs: { image: 'Dockerfile' } })).toEqual([])
  })

  it('matches Dockerfile names at any depth and ignores lookalikes', () => {
    const names = ['Dockerfile', 'a/b/c/Dockerfile.dev', 'x/app.Dockerfile', 'x/Dockerfile.md.bak']
    const skipped = ['x/NotDockerfile', 'x/Dockerfile/readme']
    const matches = [...names, ...skipped].filter(isDockerfilePath)
    expect(matches).toEqual(names)
    expect(
      /^\.github\/actions\/(?:.+\/)?action\.ya?ml$/u.test('.github/actions/a/b/action.yaml'),
    ).toBe(true)
  })

  it('allows the mirror, other registries, variables, scratch, and earlier stages', () => {
    const document: Document = {
      jobs: {
        build: {
          services: { db: { image: 'mirror.gcr.io/pgvector/pgvector' } },
          steps: [
            { run: 'CID=$(docker run -d -p "$PORT:3000" -e A "$IMAGE")' },
            { run: 'docker run --rm public.ecr.aws/x/y && docker pull ghcr.io/o/i' },
            { run: 'docker pull "$reference"' },
            { run: 'docker pull --platform linux/arm64 mirror.gcr.io/library/ubuntu' },
            { run: 'docker run --platform "$PLATFORM" -u 0 mirror.gcr.io/library/ubuntu' },
            { with: { 'driver-opts': 'image=mirror.gcr.io/moby/buildkit' } },
            { uses: 'docker/setup-buildx-action', with: { driver: 'docker' } },
            { uses: 'docker/setup-buildx-action', with: { 'driver-opts': 'image=ghcr.io/o/b' } },
          ],
        },
      },
    }

    expect(workflowImageViolations('wf', document)).toEqual([])
    expect(
      dockerfileViolations(
        'Dockerfile',
        [
          '# syntax=mirror.gcr.io/docker/dockerfile',
          'FROM mirror.gcr.io/library/node AS base',
          'FROM --platform=linux/arm64 base AS next',
          'FROM gcr.io/distroless/nodejs26 AS runtime',
          'FROM scratch',
          'FROM ${REGISTRY}/library/node',
          'FROM mirror.gcr.io/library/node:${NODE_VERSION}',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('uses the mirror in every workflow, composite action, and Dockerfile', () => {
    const yamlPaths = [
      ...readdirSync('.github/workflows').map(file => `.github/workflows/${file}`),
      ...trackedFiles().filter(path => /^\.github\/actions\/(?:.+\/)?action\.ya?ml$/u.test(path)),
    ].filter(path => /\.ya?ml$/u.test(path) && existsSync(path))
    const violations = [
      ...yamlPaths.flatMap(path =>
        workflowImageViolations(path, load(readFileSync(path, 'utf8')) as Document),
      ),
      ...dockerfilePaths().flatMap(path => dockerfileViolations(path, readFileSync(path, 'utf8'))),
    ]

    assertNoWorkflowViolations(violations)
  })
})
