import { createHash } from 'node:crypto'
import { createServer, type ServerResponse } from 'node:http'

import { onTestFinished } from 'vitest'

import { listenOnEphemeralPort } from '../ts-shared/utils/ephemeral-ports.mts'
import type { GithubPackageOptions, PackageVersion } from './image-retention-github.mts'
import type { RegistryClientOptions, RegistryTarget } from './image-registry.mts'

const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json'

function manifest(id: number, protectedArtifact: boolean) {
  return {
    ...(protectedArtifact ? { artifactType: 'application/vnd.example.attestation' } : {}),
    config: {
      digest: `sha256:${id.toString(16).padStart(64, '0')}`,
      mediaType: 'application/vnd.oci.image.config.v1+json',
      size: 100,
    },
    layers: [
      {
        digest: `sha256:${(id + 10_000).toString(16).padStart(64, '0')}`,
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        size: 200,
      },
    ],
    mediaType: OCI_MANIFEST,
    schemaVersion: 2,
  }
}

export type TestImage = {
  protected?: boolean
  target: RegistryTarget
  version: PackageVersion
}

export function testImage(
  id: number,
  target: RegistryTarget,
  sha: string,
  createdAt: string,
  options: { protected?: boolean; tags?: string[]; updatedAt?: string } = {},
): TestImage {
  const body = Buffer.from(JSON.stringify(manifest(id, options.protected ?? false)))
  return {
    protected: options.protected,
    target,
    version: {
      createdAt,
      digest: `sha256:${createHash('sha256').update(body).digest('hex')}`,
      id,
      tags: options.tags ?? [`sha-${sha}`],
      updatedAt: options.updatedAt ?? createdAt,
    },
  }
}

const sendJson = (response: ServerResponse, status: number, value: unknown, headers = {}) => {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(value))
}

const githubVersion = (version: PackageVersion) => ({
  created_at: version.createdAt,
  id: version.id,
  metadata: { container: { tags: version.tags } },
  name: version.digest,
  updated_at: version.updatedAt,
})

export async function retentionBoundary(
  images: TestImage[],
  visibleTargets: RegistryTarget[],
  initialMainTip: string,
  deleteBehavior: Record<number, 'failure' | 'reset' | 'success'> = {},
  faults: { packageStatus?: number; versionsLink?: string } = {},
) {
  const deleteRequests: number[] = []
  const githubAuthorizations: string[] = []
  let remoteMainTip = initialMainTip
  let remoteMainResponse: unknown
  const server = createServer((incoming, response) => {
    const url = new URL(incoming.url ?? '/', 'http://retention.test')
    if (url.pathname === '/token') return sendJson(response, 200, { token: 'registry-token' })
    if (url.pathname.startsWith('/orgs/') || url.pathname.startsWith('/repos/'))
      githubAuthorizations.push(incoming.headers.authorization ?? '')
    if (url.pathname === '/orgs/vouchington/packages')
      return sendJson(
        response,
        faults.packageStatus ?? 200,
        visibleTargets.map(name => ({ name, package_type: 'container' })),
      )
    if (url.pathname === '/repos/vouchington/vouchington/git/ref/heads/main')
      return sendJson(
        response,
        200,
        remoteMainResponse ?? {
          object: { sha: remoteMainTip, type: 'commit' },
          ref: 'refs/heads/main',
        },
      )
    const versionPath =
      /^\/orgs\/vouchington\/packages\/container\/(api|worker-cpu|worker-io|web)\/versions(?:\/(\d+))?$/u.exec(
        url.pathname,
      )
    if (versionPath) {
      const target = versionPath[1] as RegistryTarget
      const all: PackageVersion[] = []
      for (const image of images) if (image.target === target) all.push(image.version)
      const id = versionPath[2] ? Number(versionPath[2]) : undefined
      if (incoming.method === 'DELETE' && id) {
        deleteRequests.push(id)
        if (deleteBehavior[id] === 'reset') return response.socket?.destroy()
        if (deleteBehavior[id] === 'failure') return sendJson(response, 500, {})
        response.writeHead(204).end()
        return
      }
      if (id) return sendJson(response, 200, githubVersion(all.find(version => version.id === id)!))
      const page = Number(url.searchParams.get('page'))
      const values = all.slice((page - 1) * 100, page * 100)
      const headers =
        faults.versionsLink && page === 1
          ? { link: faults.versionsLink }
          : page * 100 < all.length
            ? {
                link: `<https://api.github.com${url.pathname}?per_page=100&page=${page + 1}>; rel="next"`,
              }
            : {}
      return sendJson(response, 200, values.map(githubVersion), headers)
    }
    const registryPath =
      /^\/v2\/vouchington\/(api|worker-cpu|worker-io|web)\/manifests\/(.+)$/u.exec(url.pathname)
    if (registryPath) {
      const target = registryPath[1] as RegistryTarget
      const reference = decodeURIComponent(registryPath[2]!)
      const image = images.find(
        item =>
          item.target === target &&
          (item.version.digest === reference || item.version.tags.includes(reference)),
      )
      if (!image) return sendJson(response, 404, { errors: [{ code: 'MANIFEST_UNKNOWN' }] })
      const body = Buffer.from(JSON.stringify(manifest(image.version.id, image.protected ?? false)))
      response.writeHead(200, {
        'content-type': OCI_MANIFEST,
        'docker-content-digest': `sha256:${createHash('sha256').update(body).digest('hex')}`,
      })
      response.end(body)
      return
    }
    sendJson(response, 500, {})
  })
  const port = await listenOnEphemeralPort(server, '127.0.0.1')
  onTestFinished(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  })
  const relay: typeof fetch = (input, init) => {
    const upstream = new URL(input instanceof Request ? input.url : input.toString())
    return fetch(`http://127.0.0.1:${port}${upstream.pathname}${upstream.search}`, init)
  }
  return {
    deleteRequests,
    githubAuthorizations,
    github: { fetch: relay } satisfies GithubPackageOptions,
    registry: { fetch: relay } satisfies RegistryClientOptions,
    setRemoteMainTip: (sha: string) => {
      remoteMainTip = sha
    },
    setRemoteMainResponse: (value: unknown) => {
      remoteMainResponse = value
    },
  }
}
