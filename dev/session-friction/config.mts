import { join } from 'node:path'

export function frictionLogDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.TMPDIR && env.TMPDIR !== '' ? env.TMPDIR : '/tmp'
  return join(base, 'voucha-session-friction-v2')
}
