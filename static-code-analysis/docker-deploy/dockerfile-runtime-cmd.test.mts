import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDockerfileRuntimeImages } from './dockerfile-runtime-cmd.mts'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const monorepoRoot = path.join(repoRoot, 'backend')
const dockerfilePath = path.join(monorepoRoot, 'Dockerfile')

describe('backend Dockerfile runtime CMDs', () => {
  const dockerfile = readFileSync(dockerfilePath, 'utf8')
  const images = parseDockerfileRuntimeImages(dockerfile, { monorepoRoot })

  it('keeps every API operational root entrypoint in the deployed workspace', () => {
    const api = images.find(image => image.stage === 'api')
    expect(api).toBeDefined()
    const missing = ['serve.mts', 'migrate.mts', 'verify-ipv6-egress.mts', 'valkey-admin.mts']
      .map(file => path.join(api!.workspaceDir, file))
      .filter(file => !existsSync(file))
    expect(missing).toEqual([])
  })

  it('parses at least the api, worker-cpu, and worker-io runtime stages', () => {
    expect(images.map(image => image.stage)).toEqual(
      expect.arrayContaining(['api', 'worker-cpu', 'worker-io']),
    )
  })

  it.each(['api', 'worker-cpu', 'worker-io'])(
    '%s runtime CMD path resolves to a real file in the deployed workspace',
    stage => {
      const image = images.find(candidate => candidate.stage === stage)
      expect(image).toBeDefined()
      // pnpm deploy --filter <pkg> --prod <target> places the filtered
      // workspace's contents at the root of <target>, then the runtime stage
      // copies <target> into WORKDIR. So the CMD path is resolved relative to
      // the source workspace directory of the deployed package.
      const resolved = path.join(image!.workspaceDir, image!.cmdPath)
      expect(existsSync(resolved) ? [] : [{ stage, resolved }]).toEqual([])
    },
  )

  it('extracts the pnpm deploy filter for each runtime stage', () => {
    const filters = Object.fromEntries(images.map(image => [image.stage, image.pnpmFilter]))
    expect(filters).toMatchObject({
      api: '@entrypoints/api',
      'worker-cpu': '@entrypoints/worker-cpu',
      'worker-io': '@entrypoints/worker-io',
    })
  })

  it('parses multiline RUN deploy commands and COPY flags like --chown', () => {
    const dockerfile = `
FROM base-node AS deploy-api
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=shared \\
    pnpm deploy --filter @entrypoints/api --prod /prod/api && \\
    node --experimental-strip-types foo

FROM runtime-base AS api
COPY --from=deploy-api --chown=65532:65532 /prod/api ./
CMD ["serve.mts"]
`.trim()

    const [image] = parseDockerfileRuntimeImages(dockerfile, { monorepoRoot })
    if (!image) throw new Error('expected runtime image for api stage')
    expect(image).toMatchObject({
      stage: 'api',
      pnpmFilter: '@entrypoints/api',
      cmdPath: 'serve.mts',
    })
    expect(existsSync(path.join(image.workspaceDir, image.cmdPath))).toBe(true)
  })

  it('uses the last CMD instruction in a stage', () => {
    const dockerfile = `
FROM base-node AS deploy-api
RUN pnpm deploy --filter @entrypoints/api --prod /prod/api

FROM runtime-base AS api
COPY --from=deploy-api /prod/api ./
CMD ["stale.mts"]
CMD ["serve.mts"]
`.trim()

    const [image] = parseDockerfileRuntimeImages(dockerfile, { monorepoRoot })
    expect(image?.cmdPath).toBe('serve.mts')
  })

  it('parses pnpm deploy commands with pnpm global options', () => {
    const dockerfile = `
FROM base-node AS deploy-api
RUN pnpm -C /app --dir /app deploy --filter @entrypoints/api --prod /prod/api

FROM runtime-base AS api
COPY --from=deploy-api /prod/api ./
CMD ["serve.mts"]
`.trim()

    const [image] = parseDockerfileRuntimeImages(dockerfile, { monorepoRoot })
    expect(image).toMatchObject({
      stage: 'api',
      pnpmFilter: '@entrypoints/api',
      cmdPath: 'serve.mts',
    })
  })

  it('keeps instructions for unnamed stages by using the stage index', () => {
    const dockerfile = `
FROM base-node AS deploy-api
RUN pnpm deploy --filter @entrypoints/api --prod /prod/api

FROM runtime-base
COPY --from=deploy-api /prod/api ./
CMD ["serve.mts"]
`.trim()

    const [image] = parseDockerfileRuntimeImages(dockerfile, { monorepoRoot })
    expect(image).toMatchObject({
      stage: '1',
      pnpmFilter: '@entrypoints/api',
      cmdPath: 'serve.mts',
    })
  })

  it('skips shell-form CMD instructions without throwing', () => {
    const dockerfile = `
FROM base-node AS deploy-api
RUN pnpm deploy --filter @entrypoints/api --prod /prod/api

FROM runtime-base AS api
COPY --from=deploy-api /prod/api ./
CMD node serve.mts
`.trim()

    expect(parseDockerfileRuntimeImages(dockerfile, { monorepoRoot })).toEqual([])
  })

  it('collects every deploy target from a combined RUN instruction', () => {
    const dockerfile = `
FROM base-node AS deploy-all
RUN pnpm deploy --filter @entrypoints/api --prod /prod/api && \\
    pnpm deploy --filter @entrypoints/worker-cpu --prod /prod/worker-cpu

FROM runtime-base AS api
COPY --from=deploy-all /prod/api ./
CMD ["serve.mts"]

FROM runtime-base AS worker-cpu
COPY --from=deploy-all /prod/worker-cpu ./
CMD ["serve.mts"]
`.trim()

    const filters = Object.fromEntries(
      parseDockerfileRuntimeImages(dockerfile, { monorepoRoot }).map(image => [
        image.stage,
        image.pnpmFilter,
      ]),
    )
    expect(filters).toMatchObject({
      api: '@entrypoints/api',
      'worker-cpu': '@entrypoints/worker-cpu',
    })
  })

  it('uses the copy whose destination is the runtime payload root', () => {
    const dockerfile = `
FROM base-node AS deploy-api
RUN pnpm deploy --filter @entrypoints/api --prod /prod/api
RUN pnpm deploy --filter @entrypoints/worker-cpu --prod /prod/worker-cpu

FROM runtime-base AS api
COPY --from=deploy-api /prod/worker-cpu /opt/sidecar
COPY --from=deploy-api /prod/api ./
CMD ["serve.mts"]
`.trim()

    const [image] = parseDockerfileRuntimeImages(dockerfile, { monorepoRoot })
    expect(image).toMatchObject({
      stage: 'api',
      pnpmFilter: '@entrypoints/api',
    })
  })
})
