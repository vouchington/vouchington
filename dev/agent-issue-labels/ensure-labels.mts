import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PRIORITY_METADATA: Readonly<Record<string, { color: string; description: string }>> = {
  'priority: critical': {
    color: 'b60205',
    description: 'Immediate incident, exploitable vulnerability, or release blocker.',
  },
  'priority: high': {
    color: 'd93f0b',
    description: 'Material risk or user impact; schedule next.',
  },
  'priority: medium': {
    color: 'fbca04',
    description: 'Normal actionable priority and default.',
  },
  'priority: low': {
    color: '0e8a16',
    description: 'Useful but not time-sensitive.',
  },
}

function priorityMetadata(name: string): { color: string; description: string } | undefined {
  const metadata = PRIORITY_METADATA[name]
  if (name.startsWith('priority:') && !metadata) {
    throw new Error(`unsupported priority label: ${name}`)
  }
  return metadata
}

export function labelColor(name: string): string {
  return priorityMetadata(name)?.color ?? 'EDEDED'
}

export function labelDescription(name: string): string {
  return priorityMetadata(name)?.description ?? `Repository issue classification: ${name}.`
}

function isDirectInvocation(): boolean {
  try {
    return Boolean(
      process.argv[1] &&
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)),
    )
  } catch {
    return false
  }
}

if (isDirectInvocation()) {
  const args = process.argv.slice(2)
  const help = args[0] === '-h' || args[0] === '--help'
  if (help && args.length === 1) {
    process.stdout.write(
      'Usage: node dev/agent-issue-labels/ensure-labels.mts [--repo <owner/repo>] [--update] <label>...\n',
    )
    process.exit(0)
  }
  if (args.includes('-h') || args.includes('--help')) throw new Error('help must be used by itself')
  const repoIdx = args.indexOf('--repo')
  if (
    repoIdx !== -1 &&
    (args.indexOf('--repo', repoIdx + 1) !== -1 ||
      !args[repoIdx + 1] ||
      args[repoIdx + 1].startsWith('-'))
  ) {
    throw new Error('--repo requires exactly one value')
  }
  const update = args.includes('--update')
  if (args.indexOf('--update') !== args.lastIndexOf('--update')) {
    throw new Error('--update may be specified only once')
  }
  const unknown = args.find(
    (arg, index) => arg.startsWith('-') && index !== repoIdx && arg !== '--update',
  )
  if (unknown) throw new Error(`unknown option: ${unknown}`)
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined
  const repoArgs = repo ? ['--repo', repo] : []
  const labels = args.filter(
    (arg, i) => arg !== '--update' && (repoIdx === -1 || (i !== repoIdx && i !== repoIdx + 1)),
  )
  if (labels.length === 0) throw new Error('at least one label is required')
  for (const label of labels) {
    labelColor(label)
    labelDescription(label)
  }

  const labelEndpointBase = repo ? `repos/${repo}/labels` : 'repos/{owner}/{repo}/labels'
  const { stdout } = await execFileAsync('gh', [
    'api',
    '--paginate',
    '--slurp',
    '-X',
    'GET',
    labelEndpointBase,
    '-F',
    'per_page=100',
  ])
  const existing = new Set(
    (JSON.parse(stdout) as Array<Array<{ name: string }>>).flat().map(({ name }) => name),
  )

  await labels.reduce<Promise<void>>(async (previous, label) => {
    await previous
    if (update || !existing.has(label)) {
      try {
        await execFileAsync('gh', [
          'label',
          'create',
          label,
          '--color',
          labelColor(label),
          '--description',
          labelDescription(label),
          ...(update ? ['--force'] : []),
          ...repoArgs,
        ])
      } catch (createError) {
        if (update) throw createError
        try {
          await execFileAsync('gh', [
            'api',
            `${labelEndpointBase}/${encodeURIComponent(label)}`,
            '--silent',
          ])
        } catch {
          throw createError
        }
      }
      existing.add(label)
    }
    process.stdout.write(`${label}\n`)
  }, Promise.resolve())
}
