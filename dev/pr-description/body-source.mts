import { execFile } from 'node:child_process'
import { fstatSync } from 'node:fs'
import { readFile as fsReadFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type BodySourceLabel = 'body-file' | 'pr' | 'stdin'

export type BodySource = {
  body: string
  source: BodySourceLabel
}

export type BodySourceDeps = {
  /** True when stdin is actively piped or file-redirected. Defaults to fstatSync detection. */
  isStdinPiped?: boolean
  readFile?: (path: string) => Promise<string>
  readStdin?: () => Promise<string>
  runGh?: (args: string[]) => Promise<string>
}

export type BodySourceOptions = BodySourceDeps & {
  bodyFile?: string
  pr?: string
}

export async function resolveBody(options: BodySourceOptions): Promise<BodySource> {
  const {
    bodyFile,
    pr,
    readFile = (path: string) => fsReadFile(path, 'utf8'),
    readStdin: readStdinImpl = defaultReadStdin,
    runGh: runGhImpl = defaultRunGh,
    isStdinPiped = defaultIsStdinPiped(),
  } = options

  if (bodyFile !== undefined) {
    // Mirror `gh pr create --body-file -` convention: treat '-' as stdin.
    if (bodyFile === '-') {
      const body = await readStdinImpl()
      return { body, source: 'stdin' }
    }
    const body = await readFile(bodyFile)
    return { body, source: 'body-file' }
  }

  if (isStdinPiped) {
    const body = await readStdinImpl()
    return { body, source: 'stdin' }
  }

  if (pr !== undefined) {
    const json = await runGhImpl(['pr', 'view', pr, '--json', 'body'])
    const parsed = JSON.parse(json) as { body: string | null }
    const body = parsed.body ?? ''
    return { body, source: 'pr' }
  }

  throw new Error(
    'No body source: provide --body-file, pipe body via stdin, or specify a PR number.',
  )
}

function defaultIsStdinPiped(): boolean {
  try {
    const stats = fstatSync(0)
    return stats.isFIFO() || stats.isFile()
  } catch {
    return false
  }
}

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function defaultRunGh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('gh', args)
  return stdout
}
