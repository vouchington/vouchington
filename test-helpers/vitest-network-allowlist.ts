const STATE_KEY = Symbol.for('voucha.testNetworkAllowlist')

// Real sockets and DNS may reach only these hosts, loopback, and local binds (0.0.0.0, ::).
// Any other host fails the test. Live-provider projects are exempt. `.ts` for Storybook SWC.
const ALLOWED_HOSTS = new Set(['example.com', 'example.net', 'example.org'])
const LIVE_PROVIDER_PROJECTS = new Set(
  'backend-aws,backend-bedrock,backend-openai,backend-openrouter,backend-stripe'.split(','),
)

type AllowlistState = { installed: boolean; violations: string[]; allowedIps: Set<string> }
type DnsFn = (this: unknown, ...args: unknown[]) => unknown
type DnsSurface = { promises?: DnsSurface; Resolver?: { prototype: DnsSurface } }
type NetModule = { isIP: (host: string) => number; Socket: { prototype: { connect: DnsFn } } }
type ConnectTarget = { host: string | null; options: Record<string, unknown> | null }

function state(): AllowlistState {
  const bag = globalThis as unknown as Record<symbol, AllowlistState | undefined>
  return (bag[STATE_KEY] ??= { installed: false, violations: [], allowedIps: new Set() })
}

class TestNetworkAllowlistError extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.name = 'TestNetworkAllowlistError'
    this.code = 'TEST_NETWORK_ALLOWLIST'
  }
}

function normalizeHost(host: string): string {
  let value = host.trim().toLowerCase()
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1)
  if (value.endsWith('.')) value = value.slice(0, -1)
  return value
}

function isLiveProviderProject(): boolean {
  const worker = (
    globalThis as unknown as Record<string, { ctx?: { projectName?: string } } | undefined>
  )['__vitest_worker__']
  const projectName = worker?.ctx?.projectName
  return projectName !== undefined && LIVE_PROVIDER_PROJECTS.has(projectName)
}

function isLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:1' || host === '0.0.0.0')
    return true
  if (host.startsWith('::ffff:')) return isLoopbackHost(host.slice('::ffff:'.length))
  const parts = host.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  return octets[0] === 127 && octets.every(part => part <= 255)
}

function isAllowedHost(host: string): boolean {
  if (isLiveProviderProject()) return true
  const normalized = normalizeHost(host)
  return (
    ALLOWED_HOSTS.has(normalized) ||
    isLoopbackHost(normalized) ||
    state().allowedIps.has(normalized)
  )
}

function block(kind: 'dns' | 'connection', host: string): TestNetworkAllowlistError {
  const action = kind === 'dns' ? 'a DNS lookup for' : 'a connection to'
  const message = `Test network allowlist blocked ${action} "${normalizeHost(host)}". Tests may only reach example.com, example.net, example.org, and loopback.`
  state().violations.push(message)
  return new TestNetworkAllowlistError(message)
}

function rememberAddresses(value: unknown): void {
  const ips = state().allowedIps
  const visit = (item: unknown): void => {
    if (typeof item === 'string') {
      if (item.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(item)) ips.add(normalizeHost(item))
      return
    }
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry)
      return
    }
    if (typeof item === 'object' && item !== null && 'address' in item) {
      visit((item as { address: unknown }).address)
    }
  }
  visit(value)
}

function isDnsQuery(name: string): boolean {
  return /^(lookup|lookupService|reverse|resolve)/.test(name)
}

function call(fn: unknown, ...args: unknown[]): void {
  ;(fn as DnsFn)(...args)
}

function wrapDns(original: DnsFn, promises: boolean): DnsFn {
  return function wrapped(this: unknown, ...args: unknown[]) {
    const host = typeof args[0] === 'string' ? args[0] : null
    const callback = args.at(-1)
    if (host !== null && !isAllowedHost(host)) {
      const error = block('dns', host)
      if (!promises && typeof callback === 'function') {
        call(callback, error)
        return undefined
      }
      if (promises) return Promise.reject(error)
      throw error
    }
    if (!promises && typeof callback === 'function') {
      const next = args.slice()
      next[next.length - 1] = (err: unknown, value: unknown, ...rest: unknown[]) => {
        if (!err) rememberAddresses(value)
        call(callback, err, value, ...rest)
      }
      return Reflect.apply(original, this, next)
    }
    const result = Reflect.apply(original, this, args)
    if (!promises || result === null || typeof result !== 'object' || !('then' in result))
      return result
    return (result as Promise<unknown>).then(value => {
      rememberAddresses(value)
      return value
    })
  }
}

function patchSurface(target: object | undefined, promises: boolean): void {
  if (!target) return
  for (const key of Object.getOwnPropertyNames(target)) {
    if (!isDnsQuery(key)) continue
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    if (!descriptor || typeof descriptor.value !== 'function') continue
    Object.defineProperty(target, key, {
      ...descriptor,
      value: wrapDns(descriptor.value as DnsFn, promises),
    })
  }
}

function connectHost(args: unknown[]): ConnectTarget {
  const list = Array.isArray(args[0]) ? (args[0] as unknown[]) : args
  const first = list[0]
  if (typeof first === 'number') {
    return { host: typeof list[1] === 'string' ? list[1] : 'localhost', options: null }
  }
  if (typeof first !== 'object' || first === null) return { host: null, options: null }
  const options = first as Record<string, unknown>
  const rawHost = options.host ?? options.hostname
  if (typeof rawHost === 'string' && rawHost.length > 0) return { host: rawHost, options }
  if (typeof options.path === 'string') return { host: null, options: null }
  if (options.port != null) return { host: 'localhost', options }
  return { host: null, options: null }
}

function patchSocketConnect(net: NetModule): void {
  const original = net.Socket.prototype.connect
  net.Socket.prototype.connect = function connect(this: unknown, ...args: unknown[]) {
    const target = connectHost(args)
    if (target.host === null || isAllowedHost(target.host))
      return Reflect.apply(original, this, args)
    const error = block('connection', target.host)
    // IP literals skip lookup, so reject them here. Hostnames still call connect so TLS can start.
    if (!target.options || net.isIP(normalizeHost(target.host)) !== 0) throw error
    target.options.lookup = (_hostname: unknown, second: unknown, third?: unknown) => {
      const callback = typeof third === 'function' ? third : second
      if (typeof callback === 'function') call(callback, error)
    }
    return Reflect.apply(original, this, args)
  } as typeof original
}

export function installTestNetworkAllowlist(): void {
  const current = state()
  if (current.installed) return
  current.installed = true
  if (typeof process.getBuiltinModule !== 'function') return
  const dns = process.getBuiltinModule('node:dns') as DnsSurface
  const net = process.getBuiltinModule('node:net') as NetModule
  if (typeof net.Socket !== 'function') return
  patchSurface(dns, false)
  patchSurface(dns.promises, true)
  patchSurface(dns.Resolver?.prototype, false)
  patchSurface(dns.promises?.Resolver?.prototype, true)
  patchSocketConnect(net)
  const nodeModule = process.getBuiltinModule('node:module') as {
    syncBuiltinESMExports?: () => void
  }
  nodeModule.syncBuiltinESMExports?.()
}

export function consumeTestNetworkAllowlistViolation(): string | null {
  const violations = state().violations
  if (violations.length === 0) return null
  const message = violations.join('\n')
  violations.length = 0
  return message
}
