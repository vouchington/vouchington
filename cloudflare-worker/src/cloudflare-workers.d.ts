declare module 'cloudflare:workers' {
  export type CachePurgeResult = import('@cloudflare/workers-types/index.ts').CachePurgeResult

  type UpstreamWorkerEntrypoint<Env, Props> =
    import('@cloudflare/workers-types/index.ts').CloudflareWorkersModule.WorkerEntrypoint<
      Env,
      Props
    >
  type UpstreamWorkerEntrypointConstructor<Env, Props> =
    typeof import('@cloudflare/workers-types/index.ts').CloudflareWorkersModule.WorkerEntrypoint<
      Env,
      Props
    >
  type UpstreamWorkerEntrypointProps<Env, Props> =
    import('@cloudflare/workers-types/index.ts').LoopbackServiceStub<
      UpstreamWorkerEntrypoint<Env, Props>
    > extends (options: { props?: infer InferredProps }) => unknown
      ? InferredProps
      : never
  type IsExact<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
      ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
        ? true
        : false
      : false
  type VerifiedUpstreamWorkerEntrypoint<Env, Props> =
    IsExact<
      ConstructorParameters<UpstreamWorkerEntrypointConstructor<Env, Props>>[1],
      Env
    > extends true
      ? IsExact<UpstreamWorkerEntrypointProps<Env, Props>, Props> extends true
        ? unknown
        : never
      : never
  type WorkerEntrypointContext<Props> = Pick<
    import('@cloudflare/workers-types/index.ts').ExecutionContext<Props>,
    'props' | 'waitUntil' | 'passThroughOnException' | 'cache'
  >

  export abstract class WorkerEntrypoint<Env = unknown, Props = unknown> {
    protected readonly ctx: WorkerEntrypointContext<Props>
    protected readonly env: Env
    constructor(
      ctx: WorkerEntrypointContext<Props> & VerifiedUpstreamWorkerEntrypoint<Env, Props>,
      env: Env,
    )
  }
}
