import { spawn } from 'node:child_process'

export interface RunCommandOptions {
  /** Called for each stderr line as it arrives, in addition to forwarding every byte to the real stderr. */
  onStderrLine?: (line: string) => void
}

export async function runPnpm(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
  options: RunCommandOptions = {},
): Promise<void> {
  await runCommand(cwd, 'pnpm', args, env, options)
}

async function runCommand(
  cwd: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: RunCommandOptions,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV ?? 'test',
        ...env,
      },
      // Piping stderr (rather than inheriting it) is only needed to observe stderr lines live;
      // every byte is still forwarded to the real stderr below so build output and failure
      // diagnostics are unaffected.
      stdio: ['inherit', 'inherit', options.onStderrLine ? 'pipe' : 'inherit'],
    })

    const onStderrLine = options.onStderrLine
    if (onStderrLine && child.stderr) {
      let buffered = ''
      child.stderr.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk)
        buffered += chunk.toString('utf8')
        const lines = buffered.split('\n')
        buffered = lines.pop() ?? ''
        for (const line of lines) onStderrLine(line)
      })
    }

    child.once('error', reject)
    // 'close' (not 'exit') guarantees every stdio 'data' event has already fired before this
    // settles, so callers reading `onStderrLine` state after the returned promise fails are
    // reading a complete picture, not a truncated one racing the process's own exit.
    child.once('close', code => {
      if (code === 0) {
        resolvePromise()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
    })
  })
}
