import type { WebFixtureEndpointContext } from './endpoint-context'

type WebFixtureInvocationResult<Body> = [Body] extends [null]
  ? null | undefined | void
  : Body | null

export type WebFixtureInvocation<Body = unknown> = (
  context: WebFixtureEndpointContext,
) => Promise<WebFixtureInvocationResult<Body>>

export interface WebApiFixtureDeclaration<Id extends string, Body> {
  readonly id: Id
  readonly body: Body
  readonly invoke: WebFixtureInvocation<Body>
  readonly additionalInvocations?: readonly WebFixtureInvocation<Body>[]
}

type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

type IsUnknown<T> = unknown extends T ? ([T] extends [unknown] ? true : false) : false
type FixtureValueShape<Expected> =
  IsUnknown<Expected> extends true
    ? unknown
    : Expected extends readonly (infer ExpectedItem)[]
      ? readonly FixtureValueShape<ExpectedItem>[]
      : Expected extends string
        ? string
        : Expected extends number
          ? number
          : Expected extends boolean
            ? boolean
            : Expected extends bigint
              ? bigint
              : Expected extends symbol
                ? symbol
                : Expected extends null
                  ? null
                  : Expected extends undefined
                    ? undefined
                    : Expected extends object
                      ? string extends keyof Expected
                        ? IsUnknown<Expected[string]> extends true
                          ? Record<string, unknown>
                          : Record<string, FixtureValueShape<Expected[string]>>
                        : { [K in keyof Expected]: FixtureValueShape<Expected[K]> }
                      : never

type ExactFixtureShape<Expected, Actual> = Expected extends readonly (infer ExpectedItem)[]
  ? Actual extends readonly (infer ActualItem)[]
    ? ReadonlyArray<ExactFixtureShape<ExpectedItem, ActualItem>>
    : never
  : Expected extends object
    ? Actual extends object
      ? string extends keyof Expected
        ? Actual extends Record<string, infer ActualValue>
          ? IsUnknown<Expected[string]> extends true
            ? Actual
            : Record<string, ExactFixtureShape<Expected[string], ActualValue>>
          : never
        : {
            [K in Exclude<keyof Expected, OptionalKeys<Expected>>]: K extends keyof Actual
              ? ExactFixtureShape<Expected[K], Actual[K]>
              : never
          } & {
            [K in OptionalKeys<Expected>]?: K extends keyof Actual
              ? ExactFixtureShape<Expected[K], Actual[K]>
              : never
          } & Record<Exclude<keyof Actual, keyof Expected>, never>
      : never
    : Actual

export function defineWebApiFixture<Expected>() {
  return <const Id extends string, Actual extends FixtureValueShape<Expected>>(
    id: Id,
    body: ExactFixtureShape<Expected, Actual>,
    invoke: WebFixtureInvocation<Expected>,
    additionalInvocations?: readonly WebFixtureInvocation<Expected>[],
  ): WebApiFixtureDeclaration<Id, Expected> => ({
    id,
    body: body as Expected,
    invoke,
    additionalInvocations,
  })
}

export type CommunityModerationResultsFixture = {
  community_agent_moderations: Record<string, unknown>[]
  openai_moderation: {
    flagged: boolean | null
    results: Record<string, unknown> | Record<string, unknown>[] | null
  }
}
