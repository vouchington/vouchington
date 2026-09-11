import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseDockerfilePrewarmStages,
  type DockerfilePrewarmStage,
} from './dockerfile-prewarm-ports.mts'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const dockerfilePath = path.join(repoRoot, 'backend', 'Dockerfile')

// registerWorkerServe (backend/worker-runtime/serve-runtime.mts) only binds a real prewarm
// listener when NODE_PREWARM_PORT is set, so a worker prewarm stage that forgets it hangs
// node-prewarm until timeout instead of binding a default port. `/prod/worker-` is a proxy for
// "this stage runs a worker entrypoint" — the exhaustiveness test below keeps a future renamed
// prewarm stage from silently escaping this rule.
function findMismatches(
  stages: readonly DockerfilePrewarmStage[],
): readonly DockerfilePrewarmStage[] {
  return stages
    .filter(stage => stage.copySource?.startsWith('/prod/worker-'))
    .filter(stage => stage.envPort === undefined || stage.envPort !== stage.monitoredPort)
}

describe('backend Dockerfile prewarm ports', () => {
  const dockerfile = readFileSync(dockerfilePath, 'utf8')
  const stages = parseDockerfilePrewarmStages(dockerfile)

  it('parses exactly the three known prewarm stages', () => {
    expect(stages.map(stage => stage.stage)).toEqual([
      'api-prewarm',
      'worker-cpu-prewarm',
      'worker-io-prewarm',
    ])
  })

  it('every worker prewarm stage sets NODE_PREWARM_PORT matching its --port value', () => {
    expect(findMismatches(stages)).toEqual([])
  })

  it('the api prewarm stage has no /prod/worker- COPY and is exempt from the rule', () => {
    // backend/entrypoints/api/serve.mts binds its own server on PORT and never calls
    // registerWorkerServe, so api-prewarm passes vacuously rather than by coincidence.
    const api = stages.find(stage => stage.stage === 'api-prewarm')
    expect(api?.copySource).toBe('/prod/api')
  })

  it('flags a worker prewarm stage missing NODE_PREWARM_PORT', () => {
    const fixture = `
FROM base-node AS worker-foo-prewarm
COPY --link --from=deploy-worker-foo /prod/worker-foo ./
ARG NODE_PREWARM_VERSION=0.3.0
RUN NODE_PREWARM=1 \\
    npx --yes node-prewarm@\${NODE_PREWARM_VERSION} "/nodejs/bin/node serve.mts" --port 4000
`.trim()

    expect(findMismatches(parseDockerfilePrewarmStages(fixture))).toEqual([
      {
        stage: 'worker-foo-prewarm',
        copySource: '/prod/worker-foo',
        monitoredPort: 4000,
        envPort: undefined,
      },
    ])
  })

  it('flags a worker prewarm stage whose NODE_PREWARM_PORT does not match --port', () => {
    const fixture = `
FROM base-node AS worker-foo-prewarm
COPY --link --from=deploy-worker-foo /prod/worker-foo ./
ARG NODE_PREWARM_VERSION=0.3.0
RUN NODE_PREWARM=1 NODE_PREWARM_PORT=4001 \\
    npx --yes node-prewarm@\${NODE_PREWARM_VERSION} "/nodejs/bin/node serve.mts" --port 4000
`.trim()

    expect(findMismatches(parseDockerfilePrewarmStages(fixture))).toEqual([
      {
        stage: 'worker-foo-prewarm',
        copySource: '/prod/worker-foo',
        monitoredPort: 4000,
        envPort: 4001,
      },
    ])
  })

  it('passes a worker prewarm stage whose NODE_PREWARM_PORT matches --port', () => {
    const fixture = `
FROM base-node AS worker-foo-prewarm
COPY --link --from=deploy-worker-foo /prod/worker-foo ./
ARG NODE_PREWARM_VERSION=0.3.0
RUN NODE_PREWARM=1 NODE_PREWARM_PORT=4000 \\
    npx --yes node-prewarm@\${NODE_PREWARM_VERSION} "/nodejs/bin/node serve.mts" --port 4000
`.trim()

    expect(findMismatches(parseDockerfilePrewarmStages(fixture))).toEqual([])
  })

  it('ignores a non-worker prewarm stage regardless of NODE_PREWARM_PORT', () => {
    const fixture = `
FROM base-node AS api-prewarm
COPY --link --from=deploy-api /prod/api ./
ARG NODE_PREWARM_VERSION=0.3.0
RUN NODE_PREWARM=1 \\
    npx --yes node-prewarm@\${NODE_PREWARM_VERSION} "/nodejs/bin/node serve.mts" --port 3000
`.trim()

    expect(findMismatches(parseDockerfilePrewarmStages(fixture))).toEqual([])
  })

  it('skips stages that do not invoke node-prewarm', () => {
    const fixture = `
FROM runtime-base AS worker-foo
COPY --from=deploy-worker-foo /prod/worker-foo ./
CMD ["serve.mts"]
`.trim()

    expect(parseDockerfilePrewarmStages(fixture)).toEqual([])
  })
})
