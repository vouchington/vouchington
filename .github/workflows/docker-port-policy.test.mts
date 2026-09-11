import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const yamlPaths = [
  ...readdirSync('.github/workflows').map(file => join('.github/workflows', file)),
  ...readdirSync('.github/actions', { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return []
    const dir = join('.github/actions', entry.name)
    return readdirSync(dir).flatMap(file => (/^action\.ya?ml$/.test(file) ? [join(dir, file)] : []))
  }),
].filter(path => /\.ya?ml$/.test(path))

// Collect the literal text of each `docker run` or `docker container run`
// invocation (joined across backslash-continued shell lines) from a YAML source string.
function dockerRunBlocks(source: string): string[] {
  const blocks: string[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/\bdocker(?:\s+container)?\s+run\b/.test(lines[i]!)) continue
    let block = lines[i]!
    let j = i
    while (block.trimEnd().endsWith('\\') && j + 1 < lines.length) {
      j++
      block = `${block.trimEnd().slice(0, -1)} ${lines[j]!}`
    }
    blocks.push(block)
  }
  return blocks
}

// Parse -p / --publish mappings from a docker run invocation string.
// Returns each mapping token with surrounding shell quotes stripped
// (e.g. `"127.0.0.1:${PORT}:5432"` → `127.0.0.1:${PORT}:5432`).
// Handles both whitespace-separated (-p 5432:5432) and equals-form (--publish=5432:5432).
function portMappings(block: string): string[] {
  const mappings: string[] = []
  const re = /(?:-p[ =]|--publish[ =])(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    mappings.push(m[1]!.replace(/^["']|["']$/g, ''))
  }
  return mappings
}

// Given a docker port mapping string, return the host-port portion or null if
// there is none (shorthand single-port form lets Docker pick the host port).
//
// Docker mapping formats:
//   containerport                           → no host port (null)
//   hostport:containerport                  → hostport
//   ip:hostport:containerport               → hostport
//   ip::containerport                       → "" (Docker picks; empty = random)
//   [ipv6]:hostport:containerport           → hostport
//   [ipv6]::containerport                   → "" (Docker picks; empty = random)
function hostPortSlot(mapping: string): string | null {
  // Strip optional protocol suffix (/tcp, /udp, /sctp)
  const base = mapping.replace(/\/(tcp|udp|sctp)$/i, '')
  // Strip optional leading IP prefix (IPv4 dotted-decimal or bracketed IPv6)
  // before splitting on ':' so that colons inside IPv6 addresses don't confuse
  // the host-port parser.  Examples:
  //   "127.0.0.1:8080:80"  → "8080:80"
  //   "[::1]:8080:80"      → "8080:80"
  //   "127.0.0.1::80"      → ":80"
  const portsOnly = base.replace(/^(?:\[[^\]]+\]|[\d.]+):/, '')
  const parts = portsOnly.split(':')
  if (parts.length === 1) {
    // Shorthand: just containerport — Docker assigns a random host port
    return null
  }
  // hostport:containerport  or  :containerport (empty = Docker picks randomly)
  return parts[0]!
}

// A host port is safe when:
//   - it is null (Docker picks it randomly)
//   - it is empty string ("" in ip::containerport form — Docker picks it)
//   - it contains a $ (variable expansion — dynamically allocated)
function isHostPortSafe(slot: string | null): boolean {
  if (slot === null || slot === '') return true
  return slot.includes('$')
}

describe('docker run port policy', () => {
  it('does not hardcode literal host ports in docker run -p mappings', () => {
    const violations: string[] = []
    for (const path of yamlPaths) {
      const source = readFileSync(path, 'utf8')
      for (const block of dockerRunBlocks(source)) {
        for (const mapping of portMappings(block)) {
          const slot = hostPortSlot(mapping)
          if (!isHostPortSafe(slot)) {
            violations.push(
              `${path}: docker run -p ${mapping} uses a hardcoded host port — allocate dynamically`,
            )
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('regression: detects the original hardcoded 5432 mapping', () => {
    const fixture = `
      docker run -d \\
        --name my-container \\
        -p 127.0.0.1:5432:5432 \\
        pgvector/pgvector:pg18
    `
    const blocks = dockerRunBlocks(fixture)
    expect(blocks.length).toBeGreaterThan(0)
    const mappings = blocks.flatMap(portMappings)
    expect(mappings).toContain('127.0.0.1:5432:5432')
    const unsafe = mappings.filter(m => !isHostPortSafe(hostPortSlot(m)))
    expect(unsafe).toEqual(['127.0.0.1:5432:5432'])
  })

  it('regression: allows native Docker random port allocation (ip::containerport)', () => {
    const fixture = `
      docker run -d \\
        --name my-container \\
        -p "127.0.0.1::5432" \\
        pgvector/pgvector:pg18
    `
    const blocks = dockerRunBlocks(fixture)
    const mappings = blocks.flatMap(portMappings)
    const unsafe = mappings.filter(m => !isHostPortSafe(hostPortSlot(m)))
    expect(unsafe).toEqual([])
  })

  it('regression: allows variable host port mappings', () => {
    const fixture = `
      docker run -d \\
        --name my-container \\
        -p "127.0.0.1:\${PGPORT}:5432" \\
        pgvector/pgvector:pg18
    `
    const blocks = dockerRunBlocks(fixture)
    const mappings = blocks.flatMap(portMappings)
    const unsafe = mappings.filter(m => !isHostPortSafe(hostPortSlot(m)))
    expect(unsafe).toEqual([])
  })

  it('regression: allows an allocator-provided OTel host port mapping', () => {
    const fixture = `
      docker run -d \\
        --name otel \\
        -p "127.0.0.1:\${OTEL_HTTP_PORT}:4318" \\
        otel/opentelemetry-collector-contrib:0.153.0
    `
    const mappings = dockerRunBlocks(fixture).flatMap(portMappings)
    const unsafe = mappings.filter(m => !isHostPortSafe(hostPortSlot(m)))
    expect(unsafe).toEqual([])
  })
})
