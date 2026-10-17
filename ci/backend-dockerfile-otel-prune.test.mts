import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync('backend/Dockerfile', 'utf8')

describe('backend image OpenTelemetry alternate builds', () => {
  it.each(['/prod/api', '/prod/worker-cpu', '/prod/worker-io'])(
    'drops unused OpenTelemetry build formats in the %s deploy layer',
    prodDir => {
      expect(dockerfile).toContain(
        `node static-code-analysis/docker-deploy/prune-opentelemetry-alternate-builds.mts ${prodDir}`,
      )
    },
  )

  it('does not keep a semantic-conventions-only find after the shared prune', () => {
    expect(dockerfile).not.toContain('@opentelemetry/semantic-conventions/build/esm')
    expect(dockerfile).not.toContain('@opentelemetry/semantic-conventions/build/esnext')
  })
})
