import { runBoundedCommand } from './bounded-exec.mts'

const SHA = /^[0-9a-f]{40}$/u

export type MainReachability = { reachable: Set<string>; tip: string }
export type MainReachabilityOptions = {
  cwd?: string
  gitExecutable?: string
  signal?: AbortSignal
}

async function git(args: string[], options: MainReachabilityOptions, maxOutputBytes: number) {
  return (
    await runBoundedCommand({
      args,
      cwd: options.cwd ?? process.cwd(),
      executable: options.gitExecutable ?? 'git',
      maxOutputBytes,
      signal: options.signal,
      timeoutMs: 30_000,
    })
  ).trim()
}

export async function loadMainReachability(
  options: MainReachabilityOptions = {},
): Promise<MainReachability> {
  try {
    if ((await git(['rev-parse', '--is-shallow-repository'], options, 1024)) !== 'false')
      throw new Error('shallow repository')
    const tip = await git(['rev-parse', 'HEAD^{commit}'], options, 1024)
    const remote = await git(['rev-parse', 'refs/remotes/origin/main^{commit}'], options, 1024)
    if (!SHA.test(tip) || remote !== tip) throw new Error('main checkout changed')
    const revisions = (await git(['rev-list', tip], options, 16 * 1024 * 1024)).split('\n')
    if (revisions.length === 0 || revisions.some(revision => !SHA.test(revision)))
      throw new Error('invalid main history')
    const reachable = new Set(revisions)
    if (reachable.size !== revisions.length || !reachable.has(tip))
      throw new Error('invalid main history')
    return { reachable, tip }
  } catch {
    throw new Error('main reachability proof failed')
  }
}
