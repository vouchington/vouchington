import type { trackJobEnqueue } from '@data-stores/analytics/queue'
import type { JobOptions, Queue } from 'glide-mq'
import type { NoSensitiveFields } from './glide-mq-payload-types.mts'
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
  buildJob: (
    input: TInput,
    index: number,
  ) => {
    data: TData
    opts?: Partial<JobOptions>
  }
  decorateError?: (
    error: ErrorWithReportingContext,
    context: EnqueueErrorContext<TCallContext>,
  ) => Error
  retry?: boolean
  /** Isolated real queues in tests may override the production queue namespace. */
  queuePrefix?: string
  trackJobEnqueue?: typeof trackJobEnqueue
}

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
  ): (
    data: NoSensitiveFields<TData>,
    perCallOpts?: Partial<JobOptions>,
    callContext?: TCallContext,
  ) => ReturnType<AddQueue['add']>
}

export type CreateBulkEnqueueFunction = <
  TInput,
  TData,
  TName extends string,
  TCallContext = unknown,
>(
  options:
    | (CreateBulkEnqueueFunctionOptions<TInput, TData, TName, TCallContext> & {
        sensitive: true
      })
    | (Omit<CreateBulkEnqueueFunctionOptions<TInput, TData, TName, TCallContext>, 'buildJob'> & {
        buildJob: (
          input: TInput,
          index: number,
        ) => { data: NoSensitiveFields<TData>; opts?: Partial<JobOptions> }
        sensitive?: false
      }),
) => (
  inputs: TInput[],
  perCallOpts?: Partial<JobOptions>,
  callContext?: TCallContext,
) => ReturnType<AddBulkQueue['addBulk']>
