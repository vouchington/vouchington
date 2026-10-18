// Interim: remove once jonathanong/no-mistakes#2182 ships the generic rule.
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
  '-e --env -p --publish -v --volume --name --network --net --add-host --entrypoint -u --user -w --workdir --tmpfs --platform --mount --label -l --env-file --health-cmd --health-interval --health-retries --health-timeout --health-start-period -m --memory --cpus --restart --cap-add --cap-drop --shm-size --log-driver --ulimit -h --hostname'.split(
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
  runs?: { steps?: Step[] }
}

function isHubImage(reference: string): boolean {
  const image = reference.replace(/^["']|["'),;]+$/gu, '')
  if (image === '' || image === 'scratch' || /\$|\{\{/u.test(image)) return false
  const [first = ''] = image.split('/')
  if (!image.includes('/')) return true
  if (HUB_HOSTS.includes(first)) return true
  return !(first.includes('.') || first.includes(':') || first === 'localhost')
}

function dockerCommandImages(script: string): string[] {
  const logical = script.replace(/\\\r?\n/gu, ' ')
  return [
    ...logical.matchAll(/\bdocker\s+(?:container\s+)?(run|pull|create)\b([^\n;&|]*)/gu),
  ].flatMap(([, verb, rest]) => {
    const tokens = rest!.match(/(?:[^\s"']|"[^"]*"|'[^']*')+/gu) ?? []
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!
      if (!token.startsWith('-')) return [token]
      if (verb !== 'pull' && VALUE_FLAGS.has(token)) i++
    }
    return []
  })
}

function stepImages(step: Step): string[] {
  const driverOptions = step.with?.['driver-opts']
  const driverImage = /(?:^|[\s,])image=(\S+)/u.exec(
    typeof driverOptions === 'string' ? driverOptions : '',
  )
  return [
    ...dockerCommandImages(step.run ?? ''),
    ...(driverImage ? [driverImage[1]!] : []),
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
    const from = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/iu.exec(line)
    if (!from) continue
    if (!stages.has(from[1]!.toLowerCase()) && isHubImage(from[1]!)) {
      violations.push(`${path}: FROM ${from[1]}`)
    }
    if (from[2]) stages.add(from[2].toLowerCase())
  }
  return violations
}

function dockerfilePaths(): string[] {
  const directories = [
    '.',
    ...readdirSync('.', { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() && !/^(?:node_modules|\.)/u.test(entry.name) ? [entry.name] : [],
    ),
  ]
  return directories.flatMap(directory =>
    readdirSync(directory).flatMap(file =>
      /^Dockerfile(?:\..+)?$/u.test(file) ? [`${directory}/${file}`] : [],
    ),
  )
}

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
    ])
    expect(
      dockerfileViolations(
        'Dockerfile',
        '# syntax=docker/dockerfile\nFROM node AS a\nFROM a AS b\n',
      ),
    ).toEqual(['Dockerfile: # syntax=docker/dockerfile', 'Dockerfile: FROM node'])
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
            { with: { 'driver-opts': 'image=mirror.gcr.io/moby/buildkit' } },
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
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('uses the mirror in every workflow, composite action, and Dockerfile', () => {
    const yamlPaths = [
      ...readdirSync('.github/workflows').map(file => `.github/workflows/${file}`),
      ...readdirSync('.github/actions').map(name => `.github/actions/${name}/action.yml`),
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
