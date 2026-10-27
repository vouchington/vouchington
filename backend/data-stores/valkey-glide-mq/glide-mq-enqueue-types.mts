import type { trackJobEnqueue } from '@data-stores/analytics/queue'
import type { JobOptions, Queue } from 'glide-mq'
import type { HasSensitiveFields, NoSensitiveFields } from './glide-mq-payload-types.mts'
import type { QueuePriorityKind } from './queue-priority.mts'

type AddQueue = Pick<Queue, 'add'> & { readonly priorityKind: QueuePriorityKind }
type AddBulkQueue = Pick<Queue, 'addBulk'> & { readonly priorityKind: QueuePriorityKind }

export type ErrorWithReportingContext = Error & {
  extra?: Record<string, unknown> | null
  tags?: Record<string, string | number | boolean> | null
}

export type EnqueueErrorContext<TCallContext = unknown> = {
  queueName: string
  jobName: string
  count: number
  callContext?: TCallContext
}

export type CreateEnqueueFunctionOptions<TName extends string, TCallContext = unknown> = {
  queue: AddQueue
  queueName: string
  jobName: TName
  defaults?: Partial<JobOptions>
  sensitive?: boolean
  decorateError?: (
    error: ErrorWithReportingContext,
    context: EnqueueErrorContext<TCallContext>,
  ) => Error
  retry?: boolean
  trackJobEnqueue?: typeof trackJobEnqueue
}

export type CreateBulkEnqueueFunctionOptions<
  TInput,
  TData,
  TName extends string,
  TCallContext = unknown,
> = {
  queue: AddBulkQueue
  queueName: string
  jobName: TName
  defaults?: Partial<JobOptions>
  sensitive?: boolean
  buildJob: (input: TInput, index: number) => { data: TData; opts?: Partial<JobOptions> }
  reactivatedData?: (data: TData, retainedData: unknown) => TData
  decorateError?: (
    error: ErrorWithReportingContext,
    context: EnqueueErrorContext<TCallContext>,
  ) => Error
  retry?: boolean
  /** Isolated real queues in tests may override the production queue namespace. */
  queuePrefix?: string
  trackJobEnqueue?: typeof trackJobEnqueue
}

type BulkEnqueue<TInput, TCallContext = unknown> = (
  inputs: TInput[],
  perCallOpts?: Partial<JobOptions>,
  callContext?: TCallContext,
) => ReturnType<AddBulkQueue['addBulk']>

export type GuardedBulkEnqueue<TInput, TCallContext = unknown> = <TActualInput extends TInput>(
  inputs: TActualInput[] &
    (TInput extends Record<string, never>
      ? unknown
      : ([true] extends [HasSensitiveFields<TInput>] ? never : unknown) &
          ([true] extends [HasSensitiveFields<TActualInput>] ? never : unknown)),
  perCallOpts?: Partial<JobOptions>,
  callContext?: TCallContext,
) => ReturnType<AddBulkQueue['addBulk']>

export type CreateEnqueueFunction = {
  <TData, TName extends string, TCallContext = unknown>(
    options: CreateEnqueueFunctionOptions<TName, TCallContext> & { sensitive: true },
  ): (
    data: TData,
    perCallOpts?: Partial<JobOptions>,
    callContext?: TCallContext,
  ) => ReturnType<AddQueue['add']>
  <TData, TName extends string, TCallContext = unknown>(
    options: CreateEnqueueFunctionOptions<TName, TCallContext> & { sensitive?: false },
  ): <TActual extends TData>(
    data: TActual &
      NoSensitiveFields<TData> &
      ([true] extends [HasSensitiveFields<TData>] ? never : unknown) &
      (TData extends Record<string, never>
        ? unknown
        : [keyof TActual] extends [never]
          ? unknown
          : ([true] extends [HasSensitiveFields<TActual>] ? never : unknown) &
              NoSensitiveFields<NoInfer<TActual>>),
    perCallOpts?: Partial<JobOptions>,
    callContext?: TCallContext,
  ) => ReturnType<AddQueue['add']>
}

type BulkFactoryOptions<
  TBuildJob extends (...args: never[]) => { data: unknown; opts?: Partial<JobOptions> },
  TName extends string,
  TCallContext,
> = Omit<
  CreateBulkEnqueueFunctionOptions<
    Parameters<TBuildJob>[0],
    ReturnType<TBuildJob>['data'],
    TName,
    TCallContext
  >,
  'buildJob'
> & {
  buildJob: TBuildJob
}

export type CreateBulkEnqueueFunction = {
  <
    TBuildJob extends (...args: never[]) => { data: unknown; opts?: Partial<JobOptions> },
    TName extends string,
    TCallContext = unknown,
  >(
    options: BulkFactoryOptions<TBuildJob, TName, TCallContext> & { sensitive: true },
    ...contract: TBuildJob extends (
      input: Parameters<TBuildJob>[0],
      index: number,
    ) => ReturnType<TBuildJob>
      ? []
      : [never]
  ): BulkEnqueue<Parameters<TBuildJob>[0], TCallContext>
  <
    TBuildJob extends (...args: never[]) => { data: unknown; opts?: Partial<JobOptions> },
    TName extends string,
    TCallContext = unknown,
  >(
    options: BulkFactoryOptions<TBuildJob, TName, TCallContext> & {
      sensitive?: false
    } & ([true] extends [HasSensitiveFields<ReturnType<TBuildJob>['data']>]
        ? never
        : [ReturnType<TBuildJob>['data']] extends [
              NoSensitiveFields<NoInfer<ReturnType<TBuildJob>['data']>>,
            ]
          ? unknown
          : never),
    ...contract: TBuildJob extends (
      input: Parameters<TBuildJob>[0],
      index: number,
    ) => ReturnType<TBuildJob>
      ? []
      : [never]
  ): GuardedBulkEnqueue<Parameters<TBuildJob>[0], TCallContext>
}
