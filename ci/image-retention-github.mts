import { readRegistryBody } from './image-registry-http.mts'
import type { RegistryTarget } from './image-registry.mts'
import {
  nextPackagePage,
  PACKAGE_PAGE_SIZE,
  parsePackageVersion,
  retentionJsonRecord as record,
} from './image-retention-github-parse.mts'

const API = 'https://api.github.com'
const MAX_PAGES = 100
const OWNER = 'vouchington'
const TARGETS = new Set<RegistryTarget>(['api', 'worker-cpu', 'worker-io', 'web'])

export type PackageVersion = {
  createdAt: string
  digest: string
  id: number
  tags: string[]
  updatedAt: string
}
export type GithubPackageOptions = {
  fetch?: typeof fetch
  maxBodyBytes?: number
  signal?: AbortSignal
  timeoutMs?: number
}

export class GithubPackageClient {
  readonly #fetch: typeof fetch
  readonly #headers: Record<string, string>
  readonly #maxBodyBytes: number
  readonly #signal?: AbortSignal
  readonly #timeoutMs: number

  constructor(token: string, options: GithubPackageOptions = {}) {
    if (!token || token.length > 16_384 || [...token].some(character => character < ' '))
      throw new Error('invalid GitHub package credentials')
    this.#fetch = options.fetch ?? fetch
    this.#headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` }
    this.#maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024
    this.#timeoutMs = options.timeoutMs ?? 10_000
    this.#signal = options.signal
    if (
      !Number.isSafeInteger(this.#maxBodyBytes) ||
      this.#maxBodyBytes <= 0 ||
      this.#maxBodyBytes > 4 * 1024 * 1024 ||
      !Number.isSafeInteger(this.#timeoutMs) ||
      this.#timeoutMs <= 0 ||
      this.#timeoutMs > 10_000
    )
      throw new Error('invalid GitHub package bounds')
  }

  async #request(url: URL, method = 'GET'): Promise<Response> {
    const timeout = AbortSignal.timeout(this.#timeoutMs)
    const signal = this.#signal ? AbortSignal.any([this.#signal, timeout]) : timeout
    const response = await this.#fetch(url, {
      headers: this.#headers,
      method,
      redirect: 'error',
      signal,
    })
    if (response.redirected) throw new Error('redirected response')
    return response
  }

  async #json(url: URL): Promise<unknown> {
    const response = await this.#request(url)
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Error('request failed')
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await readRegistryBody(response, this.#maxBodyBytes),
      ),
    ) as unknown
  }

  async #pages(path: string, query: Record<string, string> = {}): Promise<unknown[]> {
    const values: unknown[] = []
    let page = 1
    while (true) {
      if (page > MAX_PAGES) throw new Error('pagination exceeds bound')
      const url = new URL(path, API)
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
      url.searchParams.set('per_page', String(PACKAGE_PAGE_SIZE))
      url.searchParams.set('page', String(page))
      const response = await this.#request(url)
      if (response.status !== 200) {
        await response.body?.cancel()
        throw new Error('request failed')
      }
      const body = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await readRegistryBody(response, this.#maxBodyBytes),
        ),
      ) as unknown
      if (!Array.isArray(body) || body.length > PACKAGE_PAGE_SIZE) throw new Error('invalid page')
      const next = nextPackagePage(response.headers.get('link'), url)
      if (next && body.length !== PACKAGE_PAGE_SIZE) throw new Error('invalid page boundary')
      values.push(...body)
      if (!next) return values
      page = next
    }
  }

  async listPackages(): Promise<RegistryTarget[]> {
    const values = await this.#pages(`/orgs/${OWNER}/packages`, { package_type: 'container' })
    const names = values.map(value => {
      const item = record(value)
      if (typeof item?.['name'] !== 'string' || item['package_type'] !== 'container')
        throw new Error('invalid package')
      return item['name']
    })
    const selected = names.filter((name): name is RegistryTarget =>
      TARGETS.has(name as RegistryTarget),
    )
    if (new Set(selected).size !== selected.length) throw new Error('duplicate package')
    return selected.toSorted()
  }

  async listVersions(target: RegistryTarget): Promise<PackageVersion[]> {
    const values = await this.#pages(`/orgs/${OWNER}/packages/container/${target}/versions`)
    const versions = values.map(parsePackageVersion)
    if (
      new Set(versions.map(version => version.id)).size !== versions.length ||
      new Set(versions.map(version => version.digest)).size !== versions.length
    )
      throw new Error('duplicate package version')
    return versions
  }

  async getVersion(target: RegistryTarget, id: number): Promise<PackageVersion> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('invalid package version id')
    return parsePackageVersion(
      await this.#json(new URL(`/orgs/${OWNER}/packages/container/${target}/versions/${id}`, API)),
    )
  }

  async getRemoteMainTip(): Promise<string> {
    const value = record(
      await this.#json(new URL('/repos/vouchington/vouchington/git/ref/heads/main', API)),
    )
    const object = record(value?.['object'])
    const sha = object?.['sha']
    if (
      value?.['ref'] !== 'refs/heads/main' ||
      object?.['type'] !== 'commit' ||
      typeof sha !== 'string' ||
      !/^[0-9a-f]{40}$/u.test(sha)
    )
      throw new Error('invalid remote main ref')
    return sha
  }

  async deleteVersion(target: RegistryTarget, id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('invalid package version id')
    const response = await this.#request(
      new URL(`/orgs/${OWNER}/packages/container/${target}/versions/${id}`, API),
      'DELETE',
    )
    if (response.status !== 204) {
      await response.body?.cancel()
      throw new Error('package deletion failed')
    }
    await response.body?.cancel()
  }
}
