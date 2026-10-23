import { describe, expect, it } from 'vitest'
import {
  dockerfileViolations,
  isDockerfilePath,
  workflowImageViolations,
  type Document,
} from '../../static-code-analysis/repo-file-policy/docker-image-mirror.mts'

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
})
