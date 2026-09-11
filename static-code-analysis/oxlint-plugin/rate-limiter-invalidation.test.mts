import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Fixture = {
  file: string
  code: string
  expectedDiagnosticCount?: number
}

const OXLINT_BIN = resolve('node_modules/.bin/oxlint')
const PLUGIN = resolve('static-code-analysis/oxlint-plugin.cjs')

const invalid: Fixture[] = [
  {
    file: 'backend/services/example/static.test.mts',
    code: `RateLimiter.invalidate('prefix')`,
  },
  {
    file: 'backend/services/example/instance.test.mts',
    code: `new RateLimiter({ prefix: 'x' }).invalidate()`,
  },
  {
    file: 'backend/services/example/import.test.mts',
    code: `import cache from 'cache'\ncache.invalidate()`,
  },
  {
    file: 'backend/services/example/factory.test.mts',
    code: `makeLimiter().invalidate()`,
  },
  {
    file: 'backend/services/example/parameter.test.mts',
    code: `function reset(target: Cache) { target.invalidate() }`,
  },
  {
    file: 'backend/services/example/container.test.mts',
    code: `items[0].invalidate()`,
  },
  {
    file: 'backend/services/example/this.test.mts',
    code: `class Helper { reset() { this.limiter.invalidate() } }`,
  },
  {
    file: 'backend/services/example/alias.test.mts',
    code: `const reset = limiter.invalidate`,
  },
  {
    file: 'backend/services/example/bracket.test.mts',
    code: `cache['invalidate']()`,
  },
  {
    file: 'backend/services/example/optional.test.mts',
    code: `cache?.invalidate?.()`,
  },
  {
    file: 'backend/services/example/bind.test.mts',
    code: `const reset = cache.invalidate.bind(cache)`,
  },
  {
    file: 'backend/services/example/call.test.mts',
    code: `cache.invalidate.call(cache)`,
  },
  {
    file: 'backend/services/example/compound.test.mts',
    code: `cache.invalidate ||= reset
cache.invalidate &&= reset
cache.invalidate ??= reset
cache.invalidate += reset
cache.invalidate -= reset
cache.invalidate *= reset
cache.invalidate /= reset
cache.invalidate %= reset
cache.invalidate **= reset
cache.invalidate <<= reset
cache.invalidate >>= reset
cache.invalidate >>>= reset
cache.invalidate &= reset
cache.invalidate ^= reset
cache.invalidate |= reset
cache.invalidate++
--cache.invalidate`,
    expectedDiagnosticCount: 17,
  },
  {
    file: 'backend/services/example/template.test.mts',
    code: `cache[\`invalidate\`]()
cache[('invalidate' as const)]()`,
    expectedDiagnosticCount: 2,
  },
  {
    file: 'backend/services/example/destructure.test.mts',
    code: `const { invalidate } = cache`,
  },
  {
    file: 'backend/services/example/destructure-alias.test.mts',
    code: `const { ['invalidate']: reset } = cache`,
  },
  {
    file: 'backend/services/example/destructure-assignment.test.mts',
    code: `let invalidate\n;({ invalidate } = cache)`,
  },
  {
    file: 'backend/services/example/destructure-template.test.mts',
    code: `const { [\`invalidate\`]: reset } = cache`,
  },
  {
    file: 'backend/test-helpers/entities/memberships.mts',
    code: `import { ValkeyCache } from '@data-stores/valkey/cache'
import { ValkeyCache as Cache } from '@data-stores/valkey/cache'
const ACTIVE_PLANS_CACHE_PREFIX = 'membership_products:provider-v1:active_plans'
ValkeyCache.invalidate(ACTIVE_PLANS_CACHE_PREFIX)
Cache.invalidate('membership_products:provider-v1:active_plans')`,
  },
  {
    file: 'backend/test-helpers/entities/email-addresses.mts',
    code: `import { ValkeyCache } from '@data-stores/valkey/cache'
import { ValkeyCache as Cache } from '@data-stores/valkey/cache'
const cache = new ValkeyCache({ prefix: 'email-domain-validation', ttlSeconds: 3600 })
const other = new ValkeyCache({ prefix: 'other' })
const aliasCache = new Cache({ prefix: 'email-domain-validation' })
let mutable = new ValkeyCache({ prefix: 'email-domain-validation' })
const reassigned = new ValkeyCache({ prefix: 'email-domain-validation' })
const duplicateBad = new ValkeyCache({ prefix: 'email-domain-validation', prefix: 'other' })
const duplicateGood = new ValkeyCache({ prefix: 'other', prefix: 'email-domain-validation' })
const afterSpread = new ValkeyCache({ prefix: 'email-domain-validation', ...options })
const beforeSpread = new ValkeyCache({ ...options, prefix: 'email-domain-validation' })
const computedAfter = new ValkeyCache({ prefix: 'email-domain-validation', [key]: value })
const computedBefore = new ValkeyCache({ [key]: value, prefix: 'email-domain-validation' })
reassigned = other
cache.invalidate()
cache?.invalidate()
other.invalidate()
aliasCache.invalidate()
mutable.invalidate()
reassigned.invalidate()
duplicateBad.invalidate()
duplicateGood.invalidate()
afterSpread.invalidate()
beforeSpread.invalidate()
computedAfter.invalidate()
computedBefore.invalidate()`,
    expectedDiagnosticCount: 8,
  },
  ...[
    'backend/services/example.spec.mts',
    'backend/services/__tests__/example.mts',
    'backend/test-helpers/example.mts',
    'backend/services/example/test-helpers/example.mts',
    'backend/services/example/test-support.mts',
    'backend/services/example/test-support/nested.mts',
    'backend/services/example/cleanup.test-helpers.mts',
    'backend/services/example/cleanup-test-support.mts',
    'integration-tests/example.mts',
    'playwright/tests/example.spec.mts',
  ].map(file => ({ file, code: `cache.invalidate()` })),
]

const valid: Fixture[] = [
  {
    file: 'backend/services/example/bare.test.mts',
    code: `import { invalidate } from './reset.mts'\nawait invalidate()`,
  },
  {
    file: 'backend/services/example/domain-reset.test.mts',
    code: `invalidateEmailDomainCaches()\ncache.invalidateCacheGetByAny()`,
  },
  {
    file: 'backend/services/example/object.test.mts',
    code: `const handlers = { invalidate: reset }\ncache.invalidate = reset`,
  },
  {
    file: 'backend/services/example/shadow.test.mts',
    code: `function invalidate() {}\ninvalidate()`,
  },
  {
    file: 'backend/services/example/dynamic.test.mts',
    code: `cache[operation]()
cache[\`\${operation}\`]()
const { [operation]: reset } = cache`,
  },
  {
    file: 'backend/services/example/write-only.test.mts',
    code: `cache.invalidate = reset
delete cache.invalidate`,
  },
  {
    file: 'backend/services/example/source.mts',
    code: `cache.invalidate()`,
  },
  {
    file: 'playwright/global-setup.mts',
    code: `RateLimiter.invalidate('global-setup')`,
  },
]

describe('voucha/no-prefix-wide-rate-limiter-invalidate', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'voucha-oxlint-rate-limiter-'))
    for (const fixture of [...invalid, ...valid]) {
      const path = join(root, fixture.file)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, fixture.code)
    }
    writeFileSync(
      join(root, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off', suspicious: 'off', perf: 'off' },
        jsPlugins: [{ name: 'voucha', specifier: PLUGIN }],
        plugins: [],
        rules: { 'voucha/no-prefix-wide-rate-limiter-invalidate': 'error' },
      }),
    )
  })

  afterAll(() => {
    rmSync(root, { force: true, recursive: true })
  })

  it('bans statically named invalidate reads throughout protected test surfaces', () => {
    const result = spawnSync(OXLINT_BIN, ['-c', '.oxlintrc.json', '--format', 'json', '.'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    const { diagnostics } = JSON.parse(result.stdout) as {
      diagnostics: Array<{ filename: string }>
    }
    const actual = diagnostics.map(({ filename }) => filename.replace(`${root}/`, '')).toSorted()
    const expected = invalid
      .flatMap(({ expectedDiagnosticCount = 1, file }) =>
        Array.from({ length: expectedDiagnosticCount }, () => file),
      )
      .toSorted()
    expect(actual).toEqual(expected)
  })
})
