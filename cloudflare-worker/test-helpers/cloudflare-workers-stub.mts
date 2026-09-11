import type { ExecutionContext } from '@cloudflare/workers-types/index.ts'

type WorkerEntrypointContext<Props> = Pick<
  ExecutionContext<Props>,
  'props' | 'waitUntil' | 'passThroughOnException' | 'cache'
>

export class WorkerEntrypoint<Env = unknown, Props = unknown> {
  protected readonly ctx: WorkerEntrypointContext<Props>
  protected readonly env: Env

  constructor(ctx: WorkerEntrypointContext<Props>, env: Env) {
    this.ctx = ctx
    this.env = env
  }
}
