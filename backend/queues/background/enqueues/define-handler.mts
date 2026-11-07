import type { Job } from 'glide-mq'
import type { BackgroundHandler, BackgroundJobDefinition } from '../types.mts'

type DefinitionData<TDefinition> =
  TDefinition extends BackgroundJobDefinition<infer TData> ? TData : never

export function backgroundHandler<
  TDefinition extends BackgroundJobDefinition & { readonly name: string },
>(
  job: TDefinition,
  handle: (
    job: Job<DefinitionData<TDefinition>> & { readonly name: TDefinition['name'] },
  ) => unknown,
): BackgroundHandler<DefinitionData<TDefinition>> {
  return {
    job: job as BackgroundJobDefinition<DefinitionData<TDefinition>>,
    handle: queued =>
      handle(
        queued as Job<DefinitionData<TDefinition>> & {
          readonly name: TDefinition['name']
        },
      ),
  }
}

/**
 * Hands the job's payload to a processor that takes it first. Any further parameter is an injected
 * dependency, so the processor is never handed the job itself.
 */
export function backgroundDataHandler<TData>(
  job: BackgroundJobDefinition<TData>,
  process: (data: TData) => unknown,
): BackgroundHandler<TData> {
  return backgroundHandler(job, queued => process(queued.data))
}

/**
 * Runs a processor that reads nothing from the job. It is called without arguments because a
 * processor's first parameter is its injected dependencies, which the job must never fill.
 */
export function backgroundSweepHandler<TData>(
  job: BackgroundJobDefinition<TData>,
  process: () => unknown,
): BackgroundHandler<TData> {
  return backgroundHandler(job, () => process())
}
