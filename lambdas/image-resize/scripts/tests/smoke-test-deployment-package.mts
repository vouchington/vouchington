// Smoke test for the built deployment package (dist/function.zip); run `pnpm run build` first.
//
// Every other check imports the handler from source, where node_modules holds every file a
// dependency reads at runtime. This one unzips the package into an empty directory outside the
// repository and invokes the bundled handler from a fresh Node process, the way the Lambda runtime
// loads it. A signed OG card renders through satori, its harfbuzz text shaper, the Inter fonts and
// sharp, so a file the zip is missing fails here instead of on every deployed request.
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SIDELOAD_SIGNING_KEYS_ENV, signPath } from '@ts-shared/url-signing'
import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'
import { CARD_HEIGHT, CARD_WIDTH } from '../../og/card-frame.mts'

// The Lambda architecture; build:deps installs sharp's native binary for it.
const LAMBDA_TARGET = 'linux-arm64'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const packageDir = resolve(import.meta.dirname, '../..')
const hostTarget = `${process.platform}-${process.arch}`

interface HandlerResponse {
  statusCode: number
  body: string
  isBase64Encoded?: boolean
}

const root = mkdtempSync(join(tmpdir(), 'voucha-image-resize-package-'))
try {
  const taskDir = join(root, 'task')
  mkdirSync(taskDir)
  execFileSync('unzip', ['-q', join(packageDir, 'dist/function.zip'), '-d', taskDir])

  // The parent directory stands in for the Lambda runtime, which provides the AWS SDK.
  const runtimeModules = join(root, 'node_modules')
  for (const workspaceDir of [packageDir, join(packageDir, '../shared')]) {
    linkAwsSdkDependencies(workspaceDir, runtimeModules)
  }
  linkHostSharpBinary(runtimeModules)

  const png = readPngResponse(invokePackagedHandler(root, taskDir))
  process.stdout.write(`✓ Deployment package rendered a ${png.byteLength}-byte OG card\n`)
} finally {
  rmSync(root, { recursive: true, force: true })
}

function linkAwsSdkDependencies(workspaceDir: string, runtimeModules: string): void {
  const manifest = JSON.parse(readFileSync(join(workspaceDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (!name.startsWith('@aws-sdk/')) continue
    linkPackage(join(workspaceDir, 'node_modules', name), join(runtimeModules, name))
  }
}

// CI runs on the Lambda architecture, so the packaged sharp binary must load as shipped. A local
// run on another host links the host's sharp binary instead; CI refuses that substitution.
function linkHostSharpBinary(runtimeModules: string): void {
  if (hostTarget === LAMBDA_TARGET) return
  if (process.env.CI) {
    throw new Error(
      `Run this check on ${LAMBDA_TARGET} so the packaged sharp loads (${hostTarget})`,
    )
  }
  const sharpDir = realpathSync(join(packageDir, 'node_modules/sharp'))
  const name = `@img/sharp-${hostTarget}`
  linkPackage(join(dirname(sharpDir), name), join(runtimeModules, name))
}

function linkPackage(source: string, destination: string): void {
  if (existsSync(destination)) return
  mkdirSync(dirname(destination), { recursive: true })
  symlinkSync(realpathSync(source), destination, 'dir')
}

function invokePackagedHandler(root: string, taskDir: string): HandlerResponse {
  const payload = {
    type: 'generic',
    eyebrow: 'Smoke test',
    title: 'Deployment package',
    description: 'Rendered by the packaged handler.',
    domainLabel: 'voucha.example',
  }
  const ogBase64url = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const path = `/og/${ogBase64url}`
  const event = {
    path,
    pathParameters: { ogBase64url },
    queryStringParameters: { sig: signPath(path, [TEST_SIDELOAD_SIGNING_KEY]) },
    headers: {},
  }
  const responsePath = join(root, 'response.json')
  const program = `
    const { writeFileSync } = await import('node:fs')
    const { handler } = await import(${JSON.stringify(pathToFileURL(join(taskDir, 'index.mjs')).href)})
    const response = await handler(JSON.parse(process.env.SMOKE_EVENT))
    writeFileSync(process.env.SMOKE_RESPONSE_PATH, JSON.stringify(response))
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: taskDir,
    encoding: 'utf8',
    // Only deployed-function configuration; nothing (NODE_OPTIONS included) leaks from this shell.
    env: {
      AWS_REGION: 'us-west-2',
      ENVIRONMENT: 'staging',
      NODE_ENV: 'production',
      S3_BUCKET_IMAGES: 'smoke-images',
      S3_BUCKET_RENDERS: 'smoke-renders',
      [SIDELOAD_SIGNING_KEYS_ENV]: TEST_SIDELOAD_SIGNING_KEY,
      SMOKE_EVENT: JSON.stringify(event),
      SMOKE_RESPONSE_PATH: responsePath,
    },
  })
  if (result.status !== 0) {
    throw new Error(
      `The packaged handler exited with ${result.status ?? result.signal}:\n${result.stderr}`,
    )
  }
  const response = JSON.parse(readFileSync(responsePath, 'utf8')) as HandlerResponse
  if (response.statusCode !== 200) {
    throw new Error(
      `The packaged handler returned ${response.statusCode} ${response.body}:\n${result.stderr}`,
    )
  }
  return response
}

function readPngResponse(response: HandlerResponse): Buffer {
  const png = Buffer.from(response.body, response.isBase64Encoded ? 'base64' : 'utf8')
  if (!png.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)) {
    throw new Error('The packaged handler did not return a PNG')
  }
  // The IHDR chunk always comes first: width and height are its first two fields.
  const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
  if (size !== `${CARD_WIDTH}x${CARD_HEIGHT}`) {
    throw new Error(`The packaged handler rendered a ${size} card`)
  }
  return png
}
