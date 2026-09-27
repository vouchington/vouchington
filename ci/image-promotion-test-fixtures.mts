import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { onTestFinished } from 'vitest'

import { listenOnEphemeralPort } from '../ts-shared/utils/ephemeral-ports.mts'
import type { RegistryFetch, RegistryTarget } from './image-registry.mts'

const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json'
export type RegistryState = 'failure' | 'missing' | 'protected' | 'runtime'

function runtimeManifest(protectedArtifact = false): Record<string, unknown> {
  return {
    ...(protectedArtifact ? { artifactType: 'application/vnd.example.attestation' } : {}),
    config: {
      digest: `sha256:${'b'.repeat(64)}`,
      mediaType: 'application/vnd.oci.image.config.v1+json',
      size: 100,
    },
    layers: [
      {
        digest: `sha256:${'c'.repeat(64)}`,
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        size: 200,
      },
    ],
    mediaType: OCI_MANIFEST,
    schemaVersion: 2,
  }
}

export const runtimeDigest = `sha256:${createHash('sha256')
  .update(JSON.stringify(runtimeManifest()))
  .digest('hex')}`

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

function sendManifest(response: ServerResponse, protectedArtifact: boolean): void {
  const body = Buffer.from(JSON.stringify(runtimeManifest(protectedArtifact)))
  response.writeHead(200, {
    'content-type': OCI_MANIFEST,
    'docker-content-digest': `sha256:${createHash('sha256').update(body).digest('hex')}`,
  })
  response.end(body)
}

export async function temporaryPromotionWorkspace(flag?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'image-promotion-workspace-'))
  onTestFinished(() => rm(directory, { force: true, recursive: true }))
  if (flag !== undefined) {
    await mkdir(join(directory, '.github'), { recursive: true })
    await writeFile(
      join(directory, '.github/worker-io-automation.env'),
      `WORKER_IO_AUTOMATION_ENABLED=${flag}\n`,
    )
  }
  return directory
}

export async function fakePromotionGh(
  eventLog: string,
  mode: 'trusted' | 'untrusted' = 'trusted',
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'image-promotion-gh-'))
  onTestFinished(() => rm(directory, { force: true, recursive: true }))
  const executable = join(directory, 'gh')
  await writeFile(
    executable,
    `#!${process.execPath}
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
const prefix = 'oci://ghcr.io/vouchington/'
const image = (args[2] || '').startsWith(prefix) ? args[2].slice(prefix.length).split('@') : []
const sourceDigest = args[args.indexOf('--source-digest') + 1]
const target = image[0]
const digest = image[1]
if (!['api', 'worker-cpu', 'worker-io', 'web'].includes(target) || !/^sha256:[0-9a-f]{64}$/.test(digest) || !/^[0-9a-f]{40}$/.test(sourceDigest)) process.exit(8)
const publisher = target === 'web' ? 'publish-web-images.yml' : 'publish-backend-images.yml'
appendFileSync(${JSON.stringify(eventLog)}, 'provenance:' + target + '\\n')
const certificate = {
  sourceRepositoryURI: 'https://github.com/vouchington/vouchington',
  sourceRepositoryOwnerURI: 'https://github.com/vouchington',
  sourceRepositoryDigest: sourceDigest,
  buildSignerDigest: sourceDigest,
  sourceRepositoryRef: 'refs/heads/main',
  issuer: 'https://token.actions.githubusercontent.com',
  runnerEnvironment: ${JSON.stringify(mode === 'trusted' ? 'github-hosted' : 'self-hosted')},
  subjectAlternativeName: 'https://github.com/vouchington/vouchington/.github/workflows/' + publisher + '@refs/heads/main',
}
process.stdout.write(JSON.stringify([{ verificationResult: {
  signature: { certificate },
  statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [
    { name: 'ghcr.io/vouchington/' + target, digest: { sha256: digest.slice(7) } },
  ] },
} }]))
`,
  )
  await chmod(executable, 0o700)
  return executable
}

export async function startPromotionRegistry(
  states: Partial<Record<RegistryTarget, RegistryState>>,
  eventLog: string,
  tokenGate?: Promise<void>,
): Promise<{ authorizations: string[]; fetch: RegistryFetch }> {
  const authorizations: string[] = []
  const server = createServer(async (incoming, response) => {
    const url = new URL(incoming.url ?? '/', 'http://registry.test')
    authorizations.push(incoming.headers.authorization ?? '')
    if (url.pathname === '/token') {
      await tokenGate
      return sendJson(response, 200, { token: 'bearer-token' })
    }
    const match = /^\/v2\/vouchington\/(api|worker-cpu|worker-io|web)\/manifests\//u.exec(
      url.pathname,
    )
    const target = match?.[1] as RegistryTarget | undefined
    if (!target) return sendJson(response, 500, { errors: [{ code: 'UNKNOWN' }] })
    await writeFile(eventLog, `registry:${target}\n`, { flag: 'a' })
    switch (states[target]) {
      case 'runtime':
        return sendManifest(response, false)
      case 'protected':
        return sendManifest(response, true)
      case 'missing':
        return sendJson(response, 404, { errors: [{ code: 'MANIFEST_UNKNOWN' }] })
      default:
        return sendJson(response, 500, { errors: [{ code: 'UNKNOWN' }] })
    }
  })
  const port = await listenOnEphemeralPort(server, '127.0.0.1')
  onTestFinished(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  })
  return {
    authorizations,
    fetch: (input, init) => {
      const upstream = new URL(input instanceof Request ? input.url : input.toString())
      return fetch(`http://127.0.0.1:${port}${upstream.pathname}${upstream.search}`, init)
    },
  }
}

export async function setupPromotionBoundaries(
  states: Partial<Record<RegistryTarget, RegistryState>>,
  flag?: string,
  ghMode: 'trusted' | 'untrusted' = 'trusted',
) {
  const directory = await mkdtemp(join(tmpdir(), 'image-promotion-log-'))
  onTestFinished(() => rm(directory, { force: true, recursive: true }))
  const eventLog = join(directory, 'events')
  const [workspaceRoot, registry, ghExecutable] = await Promise.all([
    temporaryPromotionWorkspace(flag),
    startPromotionRegistry(states, eventLog),
    fakePromotionGh(eventLog, ghMode),
  ])
  return {
    eventLog,
    options: {
      provenance: { ghExecutable },
      registry: { fetch: registry.fetch },
      workspaceRoot,
    },
  }
}
