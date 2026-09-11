import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

async function makeTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function makeFakeAwsBin() {
  const dir = await makeTempDir('voucha-ci-aws-bin-')
  const awsPath = join(dir, 'aws')
  const argsPath = join(dir, 'aws-args.txt')

  await writeFile(
    awsPath,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$AWS_ARGS_PATH"
`,
  )
  await chmod(awsPath, 0o755)

  return { argsPath, binDir: dir }
}

describe('store-playwright-otel.sh', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { force: true, recursive: true })))
    tempDirs.length = 0
  })

  it('stores nested shard artifacts', async () => {
    const dir = await makeTempDir('voucha-otel-nested-')
    const { argsPath, binDir } = await makeFakeAwsBin()
    await mkdir(join(dir, 'playwright-otel-output-shard-1', 'otel-output'), { recursive: true })
    await mkdir(join(dir, 'playwright-otel-output-shard-1', 'playwright-web-server-logs'), {
      recursive: true,
    })
    await writeFile(join(dir, 'playwright-otel-output-shard-1', 'otel-output', 'traces.json'), '{}')
    await writeFile(
      join(dir, 'playwright-otel-output-shard-1', 'playwright-web-server-logs', 'web.log'),
      '',
    )

    await execFileAsync('./ci/store-playwright-otel.sh', {
      env: {
        ...process.env,
        AWS_ARGS_PATH: argsPath,
        OTEL_OUTPUT_ROOT: dir,
        OTEL_STORE_URI: 's3://bucket/prefix',
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      },
    })

    const args = await readFile(argsPath, 'utf8')
    expect(args).toContain(`${join(dir, 'playwright-otel-output-shard-1', 'otel-output')}\n`)
    expect(args).toContain('s3://bucket/prefix/shard-1/otel\n')
    expect(args).toContain(
      `${join(dir, 'playwright-otel-output-shard-1', 'playwright-web-server-logs')}\n`,
    )
    expect(args).toContain('s3://bucket/prefix/shard-1/web-server-logs\n')
  })

  it('accepts a flat single-artifact download', async () => {
    const dir = await makeTempDir('voucha-otel-flat-')
    const { argsPath, binDir } = await makeFakeAwsBin()
    await mkdir(join(dir, 'otel-output'), { recursive: true })
    await writeFile(join(dir, 'otel-output', 'traces.json'), '{}')

    await execFileAsync('./ci/store-playwright-otel.sh', {
      env: {
        ...process.env,
        AWS_ARGS_PATH: argsPath,
        OTEL_OUTPUT_ROOT: dir,
        OTEL_STORE_URI: 's3://bucket/prefix',
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      },
    })

    const args = await readFile(argsPath, 'utf8')
    expect(args).toContain(`${join(dir, 'otel-output')}\n`)
    expect(args).toContain('s3://bucket/prefix/shard-single/otel\n')
  })

  it('still fails when no OTel artifacts are present', async () => {
    const dir = await makeTempDir('voucha-otel-missing-')
    const { argsPath, binDir } = await makeFakeAwsBin()

    await expect(
      execFileAsync('./ci/store-playwright-otel.sh', {
        env: {
          ...process.env,
          AWS_ARGS_PATH: argsPath,
          OTEL_OUTPUT_ROOT: dir,
          OTEL_STORE_URI: 's3://bucket/prefix',
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        },
      }),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('No Playwright OTel artifacts found'),
    })

    await expect(readFile(argsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
