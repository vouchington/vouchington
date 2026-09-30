import { runProcess } from './process.mts'

/** Runs git with the given arguments and optional stdin, resolving to stdout. */
export type Git = (args: readonly string[], input?: string) => Promise<string>

export function createGit(cwd: string): Git {
  return async (args, input) => {
    const result = await runProcess('git', args, { cwd, ...(input === undefined ? {} : { input }) })
    if (result.error) throw new Error(`git ${args[0]} could not start: ${result.error.message}`)
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed (${result.status}): ${result.stderr.trim()}`)
    }
    return result.stdout
  }
}
