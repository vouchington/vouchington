import type { EventEmitter } from 'node:events'

export type Child = EventEmitter & {
  kill: (signal: NodeJS.Signals) => boolean
  pid: number | undefined
  stderr: EventEmitter
  stdout: EventEmitter
}
