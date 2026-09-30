import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync('web/Dockerfile', 'utf8')

function countDockerfileCopies(copyInstruction: string): number {
  return dockerfile.split(/\r?\n/).filter(line => line.trim() === copyInstruction.trim()).length
}

describe('web Dockerfile dependency install', () => {
  it('runs the underlying Next build directly inside the isolated build container', () => {
    expect(dockerfile).toContain('NODE_ENV=production pnpm --dir web exec next build')
    expect(dockerfile).toContain('--mount=type=secret,id=SENTRY_AUTH_TOKEN,required=false')
    expect(dockerfile).toContain('test -s /run/secrets/SENTRY_AUTH_TOKEN')
    expect(dockerfile).not.toContain('ARG SENTRY_AUTH_TOKEN')
    expect(dockerfile).not.toContain('ENV SENTRY_AUTH_TOKEN')
    expect(dockerfile).not.toContain('pnpm --dir web build')
    expect(dockerfile).not.toContain('with-build-lock.sh')
  })
  it('installs only the declared web dependency closure before source copies', () => {
    const installCommand = "pnpm install --frozen-lockfile --ignore-scripts --filter 'web...'"
    const installIndex = dockerfile.indexOf(installCommand)
    const rebuildIndex = dockerfile.indexOf("pnpm rebuild --pending --filter 'web...'")
    const firstSourceCopyIndex = dockerfile.indexOf('COPY backend/types/ /app/backend/types/')

    expect(installIndex).toBeGreaterThanOrEqual(0)
    expect(rebuildIndex).toBeGreaterThan(installIndex)
    expect(rebuildIndex).toBeLessThan(firstSourceCopyIndex)
    expect(dockerfile.slice(installIndex, rebuildIndex)).toContain('&& \\\n')
    expect(dockerfile.match(/pnpm install --frozen-lockfile/g)).toHaveLength(1)
    expect(dockerfile.match(/pnpm rebuild --pending/g)).toHaveLength(1)
    expect(dockerfile).not.toContain("--filter './ts-shared/*...'")
    expect(dockerfile).not.toContain("--filter './backend/types...'")
  })

  it('copies catalog JSON so non-deployed production SSR can assemble without the API', () => {
    const localizationCopy = dockerfile.indexOf('COPY localization/ /app/localization/')
    const nextBuild = dockerfile.indexOf('NODE_ENV=production pnpm --dir web exec next build')

    expect(localizationCopy).toBeGreaterThan(-1)
    expect(nextBuild).toBeGreaterThan(localizationCopy)
  })

  it('does not run a separate fetch or enable fetch-only CI behavior', () => {
    expect(dockerfile).not.toContain('pnpm fetch')
    expect(dockerfile).not.toContain('ENV CI=true')
  })

  it('refreshes the shared Alpine security-upgrade layer independently of the web GHA cache and local validation images', () => {
    const refreshArgumentIndex = dockerfile.indexOf('ARG ALPINE_SECURITY_REFRESH=')
    const refreshArgumentLine = dockerfile.slice(refreshArgumentIndex).split(/\r?\n/)[0]
    const upgradeIndex = dockerfile.indexOf('apk update && apk upgrade --no-cache')

    expect(refreshArgumentLine).toMatch(/^ARG ALPINE_SECURITY_REFRESH=\d{4}-\d{2}-\d{2}$/)
    expect(upgradeIndex).toBeGreaterThan(refreshArgumentIndex)
    expect(dockerfile.slice(refreshArgumentIndex, upgradeIndex)).toContain(
      '${ALPINE_SECURITY_REFRESH}',
    )
  })

  it.each([
    ['COPY --link --from=builder /app/web/public ./web/public', 2],
    ['COPY --link --from=builder --chown=1001:1001 /app/web/.next/standalone ./', 2],
    ['COPY --link --from=builder --chown=1001:1001 /app/web/.next/static ./web/.next/static', 2],
    [
      'COPY --link --from=web-prewarm --chown=1001:1001 /app/web/.node_compile_cache ./web/.node_compile_cache',
      1,
    ],
  ])(
    'keeps generated runtime artifact copies linked for cache reuse: %s',
    (copyInstruction, expectedCount) => {
      expect(countDockerfileCopies(copyInstruction)).toBe(expectedCount)
    },
  )

  it('removes build-only Node headers and local documentation from the runtime image', () => {
    expect(dockerfile).toContain('/usr/local/include/node')
    expect(dockerfile).toContain('/usr/local/share/doc')
    expect(dockerfile).toContain('/usr/local/share/man')
    expect(dockerfile).toContain('/usr/share/doc')
    expect(dockerfile).toContain('/usr/share/man')
    expect(dockerfile).toContain('/usr/share/info')
  })
})
