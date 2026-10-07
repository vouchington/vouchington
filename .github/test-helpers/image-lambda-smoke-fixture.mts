import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

interface SmokeOutcome {
  code: number | string | null
  killed: boolean
  signal: string | null
  stdout: string
  stderr: string
}

export async function runImageLambdaSmoke(firstError?: string) {
  const directory = await mkdtemp(join(tmpdir(), 'voucha-image-lambda-smoke-'))
  const closures: Promise<void>[] = []
  const actors = new Set<Socket>()
  let stopping = false
  const trace: string[] = []
  let state: 'failed' | 'ready' | undefined
  let waiting: Socket[] = []
  const answer = (socket: Socket, request: string) => {
    trace.push(request)
    socket.end(`${request === 'probe' && state === 'ready' && firstError ? '200' : '000'}\n`)
  }
  const server = createServer(socket => {
    closures.push(new Promise<void>(resolveClosed => socket.once('close', resolveClosed)))
    socket.on('error', () => {})
    let input = ''
    socket.on('data', chunk => {
      input += chunk.toString()
      for (let newline = input.indexOf('\n'); newline >= 0; newline = input.indexOf('\n')) {
        const message = input.slice(0, newline)
        input = input.slice(newline + 1)
        if (message === 'allocate') {
          state = undefined
          socket.end('allocated\n')
        } else if (message.startsWith('actor ')) {
          const [, , published] = message.split(' ')
          actors.add(socket)
          if (stopping) socket.end()
          state = published === 'failed' ? 'failed' : 'ready'
          for (const pending of waiting) answer(pending, 'probe')
          waiting = []
        } else if (message.startsWith('signal ')) {
          trace.push(message)
        } else if (message === 'probe' && state === undefined) {
          waiting.push(socket)
        } else {
          answer(socket, message)
        }
      }
    })
  })
  let child: ReturnType<typeof execFile> | undefined
  let completion: Promise<SmokeOutcome> | undefined
  let failed = false
  const cleanup = async () => {
    try {
      child?.kill('SIGKILL')
      stopping = true
      for (const socket of actors) socket.end()
      for (const socket of waiting) socket.end('000\n')
      await completion
      if (server.listening) {
        await new Promise<void>((resolveClosed, reject) =>
          server.close(err => (err ? reject(err) : resolveClosed())),
        )
      }
      await Promise.all(closures)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  try {
    await new Promise<void>((resolveListening, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolveListening)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing owned control port')
    const bin = join(directory, 'bin')
    await mkdir(bin)
    const executable = async (name: string, body: string, interpreter = '/bin/bash') => {
      const path = join(bin, name)
      await writeFile(path, `#!${interpreter}\n${body}\n`)
      await chmod(path, 0o755)
    }
    await executable(
      'python3',
      `set -euo pipefail
count=0
[ -f "$ALLOCATIONS_FILE" ] && count=$(<"$ALLOCATIONS_FILE")
count=$((count + 1))
echo "$count" > "$ALLOCATIONS_FILE"
echo allocate >> "$EVENTS_FILE"
exec 3<>/dev/tcp/127.0.0.1/${address.port}
printf 'allocate\\n' >&3
IFS= read -r reply <&3
echo $((41000 + count))`,
    )
    // A real Node interpreter can handle SIGINT even when backgrounded by Bash.
    await executable(
      'node',
      `const fs = require('node:fs')
const net = require('node:net')
fs.appendFileSync(process.env.EVENTS_FILE, 'launch\\n')
const count = fs.existsSync(process.env.LAUNCHES_FILE)
  ? Number(fs.readFileSync(process.env.LAUNCHES_FILE, 'utf8')) + 1 : 1
fs.writeFileSync(process.env.LAUNCHES_FILE, String(count))
const failed = count === 1 && Boolean(process.env.FIRST_NODE_OUTPUT)
if (failed) fs.writeSync(2, process.env.FIRST_NODE_OUTPUT + '\\n')
else if (!process.env.FIRST_NODE_OUTPUT) fs.writeSync(1, 'Lambda dev server: http://localhost:41001\\n')
const socket = net.connect(${address.port}, '127.0.0.1')
socket.on('error', () => process.exit(1))
socket.on('close', () => process.exit(failed ? 1 : 0))
socket.once('connect', () => {
  socket.write('actor ' + process.pid + ' ' + (failed ? 'failed' : 'ready') + '\\n')
  if (failed) socket.end()
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => socket.end('signal ' + signal + '\\n'))
}`,
      process.execPath,
    )
    const request = (message: string) => `set -euo pipefail
exec 3<>/dev/tcp/127.0.0.1/${address.port}
printf '${message}\\n' >&3
IFS= read -r reply <&3
printf '%s' "$reply"`
    await executable('curl', request('probe'))
    await executable('sleep', request('step'))
    completion = new Promise<SmokeOutcome>(resolveCompleted => {
      child = execFile(
        'bash',
        [resolve('lambdas/image-resize/scripts/tests/smoke-test-image-lambda.sh')],
        {
          timeout: 4_000,
          killSignal: 'SIGKILL',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ''}`,
            ALLOCATIONS_FILE: join(directory, 'allocations'),
            LAUNCHES_FILE: join(directory, 'launches'),
            EVENTS_FILE: join(directory, 'events'),
            FIRST_NODE_OUTPUT: firstError ?? '',
          },
        },
        (error, stdout, stderr) =>
          resolveCompleted({
            code: error?.code ?? 0,
            killed: error?.killed ?? false,
            signal: error?.signal ?? null,
            stdout,
            stderr,
          }),
      )
      // The deadline can kill the shell; release its owned actors/pipes on actual exit.
      child.once('exit', () => {
        stopping = true
        for (const socket of actors) socket.end()
        for (const socket of waiting) socket.end('000\n')
      })
    })
    const result = await completion
    return {
      result,
      trace,
      allocations: (await readFile(join(directory, 'allocations'), 'utf8')).trim(),
      events: (await readFile(join(directory, 'events'), 'utf8')).trim().split('\n'),
    }
  } catch (err) {
    failed = true
    throw err
  } finally {
    await cleanup().catch(err =>
      failed ? undefined : Promise.reject(err instanceof Error ? err : new Error(String(err))),
    )
  }
}
