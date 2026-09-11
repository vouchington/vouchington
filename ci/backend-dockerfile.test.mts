import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync('backend/Dockerfile', 'utf8')
const dockerBake = readFileSync('backend/docker-bake.hcl', 'utf8')
const dockerignore = readFileSync('.dockerignore', 'utf8')

function normalizeDockerfileInstruction(instruction: string): string {
  return instruction.trim().replace(/\s+/g, ' ')
}

function countCopyInstructions(copyInstruction: string): number {
  const normalizedTarget = normalizeDockerfileInstruction(copyInstruction)
  return dockerfile
    .split(/\r?\n/)
    .filter(line => normalizeDockerfileInstruction(line) === normalizedTarget).length
}

function extractDockerfileInstructions(source: string): string[] {
  const instructions: string[] = []
  let currentInstruction = ''

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const continues = line.endsWith('\\')
    currentInstruction = `${currentInstruction} ${continues ? line.slice(0, -1) : line}`.trim()
    if (!continues) {
      instructions.push(normalizeDockerfileInstruction(currentInstruction))
      currentInstruction = ''
    }
  }

  if (currentInstruction) {
    throw new Error(`Dockerfile instruction is missing its continuation: ${currentInstruction}`)
  }

  return instructions
}

const dockerfileInstructions = extractDockerfileInstructions(dockerfile)

function getStageHeader(stageName: string): string {
  const stageHeader = dockerfileInstructions.find(
    instruction => instruction.startsWith('FROM ') && instruction.endsWith(` AS ${stageName}`),
  )

  if (!stageHeader) {
    throw new Error(`Dockerfile is missing the ${stageName} stage`)
  }

  return stageHeader
}

function getStageInstructions(stageName: string): string[] {
  const stageHeader = getStageHeader(stageName)
  const stageStart = dockerfileInstructions.indexOf(stageHeader)
  const nextStage = dockerfileInstructions.findIndex(
    (instruction, index) => index > stageStart && instruction.startsWith('FROM '),
  )
  return dockerfileInstructions.slice(stageStart + 1, nextStage === -1 ? undefined : nextStage)
}

function getInstructionsByType(instructions: string[], type: string): string[] {
  return instructions.filter(instruction => instruction.startsWith(`${type} `))
}

function getNodeEnvironmentInstructions(instructions: string[]): string[] {
  return getInstructionsByType(instructions, 'ENV').filter(instruction =>
    /(?:^|\s)NODE_ENV(?:\s|=)/.test(instruction),
  )
}

function getRuntimeBaseCopies(instructions: string[]): string[] {
  return getInstructionsByType(instructions, 'COPY').filter(instruction =>
    instruction.includes('--from=runtime-base'),
  )
}

describe('backend Dockerfile dependency install', () => {
  it('overlays upgraded OpenSSL files and metadata into the distroless runtime', () => {
    expect(dockerfile).toContain('FROM base-node AS openssl-overlay')
    expect(dockerfile).toContain('set -- /usr/lib/*-linux-gnu/libssl.so.3')
    expect(dockerfile).not.toContain('dpkg-query -L libssl3t64 |')
    expect(dockerfile).toContain('dpkg-query -s libssl3t64')
    expect(dockerfile).toContain('dpkg-query -s openssl-provider-legacy')
    expect(dockerfile).toContain('COPY --from=openssl-overlay /distroless-openssl/ /')
    expect(dockerBake).toContain('pull            = true')
    expect(dockerBake).toContain('no-cache-filter = ["base-node", "openssl-overlay"]')
  })

  it('installs filtered dependencies directly without a prefetch lifecycle pass', () => {
    expect(dockerfile).not.toContain('pnpm fetch')
    expect(dockerfile).not.toContain('ENV CI=true')
  })

  it('installs only the entrypoint closures plus email-templates in one layer', () => {
    expect(dockerfile).toContain(
      'pnpm install --frozen-lockfile --filter @entrypoints/api... --filter @entrypoints/worker-cpu... --filter @entrypoints/worker-io... --filter ./email-templates... --ignore-scripts',
    )
    expect(dockerfile.match(/pnpm install --frozen-lockfile/g)).toHaveLength(1)
  })

  it('rebuilds pending install scripts for the same filter set as the install layer', () => {
    expect(dockerfile).toContain(
      'pnpm rebuild --pending --filter @entrypoints/api... --filter @entrypoints/worker-cpu... --filter @entrypoints/worker-io... --filter ./email-templates...',
    )
    expect(dockerfile.match(/pnpm rebuild --pending/g)).toHaveLength(1)
  })

  it('copies every dependency manifest before the filtered install layer', () => {
    const rootManifestCopy = dockerfile.indexOf(
      'COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./',
    )
    const workspaceManifestCopy = dockerfile.indexOf(
      'COPY --parents api-fixtures/package.json backend/package.json backend/*/package.json backend/*/*/package.json ci/package.json email-templates/package.json ts-shared/*/package.json ./',
    )
    const filteredInstall = dockerfile.indexOf('pnpm install --frozen-lockfile')

    expect(rootManifestCopy).toBeGreaterThan(-1)
    expect(workspaceManifestCopy).toBeGreaterThan(rootManifestCopy)
    expect(filteredInstall).toBeGreaterThan(workspaceManifestCopy)
    expect(dockerignore.split(/\r?\n/)).toEqual(
      expect.arrayContaining(['!api-fixtures/', '!api-fixtures/**', '!ci/', '!ci/package.json']),
    )
    expect(dockerfile).toContain('COPY api-fixtures/ ./api-fixtures/')
  })

  it.each([
    ['@entrypoints/api', '/prod/api'],
    ['@entrypoints/worker-cpu', '/prod/worker-cpu'],
    ['@entrypoints/worker-io', '/prod/worker-io'],
  ])('prunes TypeScript declaration artifacts in the %s deploy layer', (filter, prodDir) => {
    expect(dockerfile).toContain(
      `pnpm deploy --filter ${filter} --prod ${prodDir} --legacy && \\\n    node --experimental-strip-types static-code-analysis/docker-deploy/prune-deployed-runtime-deps.mts ${prodDir}`,
    )
  })

  it('does not couple generic deploy pruning to BuildKit target-platform arguments', () => {
    expect(dockerfile).not.toContain('ARG TARGETOS TARGETARCH')
    expect(dockerfile).not.toContain('prune-deployed-runtime-deps.mts --target-platform')
  })

  it('keeps only the docker-deploy helper in the Docker build context', () => {
    const dockerignoreLines = dockerignore.split(/\r?\n/)

    expect(dockerfile).toContain(
      'COPY static-code-analysis/docker-deploy/ ./static-code-analysis/docker-deploy/',
    )
    expect(dockerignoreLines).toContain('!static-code-analysis/')
    expect(dockerignoreLines).toContain('!static-code-analysis/docker-deploy/')
    expect(dockerignoreLines).toContain('!static-code-analysis/docker-deploy/**')
    expect(dockerignore).not.toContain('!static-code-analysis/**')
  })

  it.each([
    ['COPY --link --from=deploy-api /prod/api ./'],
    ['COPY --link --from=deploy-api --chown=65532:65532 /prod/api/node_modules ./node_modules'],
    ['COPY --link --from=deploy-api --exclude=node_modules --chown=65532:65532 /prod/api ./'],
    [
      'COPY --link --from=api-prewarm --chown=65532:65532 /app/backend/.node_compile_cache /app/backend/.node_compile_cache',
    ],
    ['COPY --link --from=deploy-worker-cpu /prod/worker-cpu ./'],
    [
      'COPY --link --from=deploy-worker-cpu --chown=65532:65532 /prod/worker-cpu/node_modules ./node_modules',
    ],
    [
      'COPY --link --from=deploy-worker-cpu --exclude=node_modules --chown=65532:65532 /prod/worker-cpu ./',
    ],
    [
      'COPY --link --from=worker-cpu-prewarm --chown=65532:65532 /app/backend/.node_compile_cache /app/backend/.node_compile_cache',
    ],
    ['COPY --link --from=deploy-worker-io /prod/worker-io ./'],
    [
      'COPY --link --from=deploy-worker-io --chown=65532:65532 /prod/worker-io/node_modules ./node_modules',
    ],
    [
      'COPY --link --from=deploy-worker-io --exclude=node_modules --chown=65532:65532 /prod/worker-io ./',
    ],
    [
      'COPY --link --from=worker-io-prewarm --chown=65532:65532 /app/backend/.node_compile_cache /app/backend/.node_compile_cache',
    ],
  ])(
    'keeps prewarm and final runtime artifact copies linked for cache reuse: %s',
    copyInstruction => {
      expect(countCopyInstructions(copyInstruction)).toBe(1)
    },
  )

  it.each(['/prod/api', '/prod/worker-cpu', '/prod/worker-io'])(
    'normalizes the %s deploy tree in the same RUN as workspace restore',
    prodDir => {
      expect(dockerfile).toContain(
        `node --experimental-strip-types static-code-analysis/docker-deploy/restore-deployed-workspace-packages.mts ${prodDir} && \\\n    node --experimental-strip-types static-code-analysis/docker-deploy/normalize-deployed-layer.mts ${prodDir}`,
      )
    },
  )

  it('excludes only the deploy-tree root node_modules directory', () => {
    expect(dockerfile).not.toContain('--exclude=**/node_modules')
    expect(dockerfile.match(/^COPY .*--exclude=node_modules/gm)).toHaveLength(3)
  })

  it('does not copy the mixed deploy tree into a runtime stage', () => {
    expect(dockerfile).not.toContain(
      'COPY --link --from=deploy-api --chown=65532:65532 /prod/api ./',
    )
    expect(dockerfile).not.toContain(
      'COPY --link --from=deploy-worker-cpu --chown=65532:65532 /prod/worker-cpu ./',
    )
    expect(dockerfile).not.toContain(
      'COPY --link --from=deploy-worker-io --chown=65532:65532 /prod/worker-io ./',
    )
  })

  it('uses --link for every deploy-tree copy used by prewarm and final runtime stages', () => {
    const unlinkedDeployCopies = dockerfile
      .split(/\r?\n/)
      .filter(line => line.trimStart().startsWith('COPY ') && line.includes('--from=deploy-'))
      .filter(line => !line.includes('--link'))

    expect(unlinkedDeployCopies).toEqual([])
  })

  it('shares the distroless Node setup through a prewarm base stage', () => {
    const prewarmBaseInstructions = getStageInstructions('prewarm-base')

    expect(getStageHeader('prewarm-base')).toBe('FROM base-node AS prewarm-base')
    expect(prewarmBaseInstructions).toEqual([
      'ENV NODE_ENV=production',
      'WORKDIR /app/backend',
      'COPY --from=runtime-base /nodejs /nodejs',
    ])
    expect(getRuntimeBaseCopies(dockerfileInstructions)).toHaveLength(1)

    for (const stageName of ['api-prewarm', 'worker-cpu-prewarm', 'worker-io-prewarm']) {
      expect(getStageHeader(stageName)).toBe(`FROM prewarm-base AS ${stageName}`)

      const stageInstructions = getStageInstructions(stageName)
      expect(getNodeEnvironmentInstructions(stageInstructions)).toEqual([])
      expect(getInstructionsByType(stageInstructions, 'WORKDIR')).toEqual([])
      expect(getRuntimeBaseCopies(stageInstructions)).toEqual([])
    }
  })
})
