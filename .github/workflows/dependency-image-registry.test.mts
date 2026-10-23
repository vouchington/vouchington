// See docs/checklists/github-actions.md for when this check can be removed.
import { describe, expect, it } from 'vitest'
import {
  dockerfileViolations,
  isDockerfilePath,
  workflowImageViolations,
  type Document,
} from '../../static-code-analysis/repo-file-policy/docker-image-mirror.mts'

describe('Docker Hub images use reviewed dependency packages', () => {
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
      'node must use a reviewed GHCR dependency package',
      'pgvector/pgvector must use a reviewed GHCR dependency package',
      'otel/collector must use a reviewed GHCR dependency package',
      'docker.io/library/redis must use a reviewed GHCR dependency package',
      'alpine must use a reviewed GHCR dependency package',
      'moby/buildkit must use a reviewed GHCR dependency package',
      'moby/buildkit must use a reviewed GHCR dependency package',
      'ubuntu must use a reviewed GHCR dependency package',
      'busybox must use a reviewed GHCR dependency package',
      'ubuntu must use a reviewed GHCR dependency package',
      'alpine must use a reviewed GHCR dependency package',
      'busybox must use a reviewed GHCR dependency package',
      'node:${{ must use a reviewed GHCR dependency package',
      'debian must use a reviewed GHCR dependency package',
      'moby/buildkit must use a reviewed GHCR dependency package',
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
    ).toEqual(['alpine must use a reviewed GHCR dependency package'])
    expect(workflowImageViolations('action.yml', { runs: { image: 'Dockerfile' } })).toEqual([])
    expect(
      workflowImageViolations('wf', {
        jobs: { build: { services: { db: { image: 'mirror.gcr.io/example/db' } } } },
      }),
    ).toEqual([
      'wf#build service db: mirror.gcr.io/example/db must use a reviewed GHCR dependency package',
    ])
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

  it('allows GHCR, other registries, variables, scratch, and earlier stages', () => {
    const document: Document = {
      jobs: {
        build: {
          services: { db: { image: 'ghcr.io/vouchington/dependency-pgvector' } },
          steps: [
            { run: 'CID=$(docker run -d -p "$PORT:3000" -e A "$IMAGE")' },
            { run: 'docker run --rm public.ecr.aws/x/y && docker pull ghcr.io/o/i' },
            { run: 'docker pull "$reference"' },
            { run: 'docker pull --platform linux/arm64 ghcr.io/vouchington/dependency-ubuntu' },
            { run: 'docker run --platform "$PLATFORM" -u 0 ghcr.io/vouchington/dependency-ubuntu' },
            { with: { 'driver-opts': 'image=ghcr.io/vouchington/dependency-buildkit' } },
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
          '# syntax=ghcr.io/vouchington/dependency-dockerfile',
          'FROM ghcr.io/vouchington/dependency-node AS base',
          'FROM --platform=linux/arm64 base AS next',
          'FROM gcr.io/distroless/nodejs26 AS runtime',
          'FROM scratch',
          'FROM ${REGISTRY}/library/node',
          'FROM ghcr.io/vouchington/dependency-node:${NODE_VERSION}',
        ].join('\n'),
      ),
    ).toEqual([])
  })
})
