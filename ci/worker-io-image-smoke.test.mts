import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const dockerfile = readFileSync('backend/Dockerfile', 'utf8')
const dockerBake = readFileSync('backend/docker-bake.hcl', 'utf8')

function stageBody(stageName: string): string {
  const marker = `AS ${stageName}\n`
  const start = dockerfile.indexOf(marker)
  if (start < 0) throw new Error(`missing stage ${stageName}`)
  const rest = dockerfile.slice(start + marker.length)
  const next = rest.search(/^FROM /m)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('worker-io image cli smoke', () => {
  it('runs sort -u and comm through the wrapper', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'worker-io-cli-smoke-'))
    try {
      await expect(
        execFileAsync(process.execPath, ['backend/modules/child-process/image-smoke.mts'], {
          env: { ...process.env, TMPDIR: dir },
        }),
      ).resolves.toMatchObject({ stdout: '' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('copies sort and comm into both worker images and points TMPDIR at writable storage', () => {
    for (const stageName of ['worker-cpu', 'worker-io']) {
      const body = stageBody(stageName)
      expect(body).toContain('COPY --from=worker-io-cli /worker-io-cli/ /')
      expect(body).toContain('ENV TMPDIR=/tmp')
    }
    expect(stageBody('worker-io-cli')).toContain('ldd /usr/bin/sort /usr/bin/comm')
    expect(stageBody('worker-io-cli')).toContain('readlink -f')
    expect(stageBody('worker-io-cli')).toContain('/lib/*|/lib64/*')
    expect(stageBody('worker-io-cli')).toContain('copy_path /usr/bin/sort')
    expect(stageBody('worker-io-cli')).toContain('copy_path /usr/bin/comm')

    const smoke = stageBody('worker-io-cli-smoke')
    expect(smoke).toContain('COPY --from=worker-io-cli /worker-io-cli/ /')
    expect(smoke).toContain('ENV TMPDIR=/tmp')
    expect(smoke).toContain('RUN ["/nodejs/bin/node", "/app/image-smoke.mts"]')
    expect(dockerBake).toContain('target "worker-io-cli-smoke"')

    const workerCpuSmoke = stageBody('worker-cpu-cli-smoke')
    expect(workerCpuSmoke).toContain('RUN ["/nodejs/bin/node", "/app/image-smoke.mts"]')
    expect(dockerBake).toContain('target "worker-cpu-cli-smoke"')

    const api = stageBody('api')
    expect(api).not.toContain('worker-io-cli')
    expect(api).not.toContain('TMPDIR')
  })
})
