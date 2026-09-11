import {
  composeQueryContracts as composePlatformQueryContracts,
  defineQueryContract as definePlatformQueryContract,
  queryBoolean as createQueryBoolean,
  queryCsvArray as createQueryCsvArray,
  queryEnum as createQueryEnum,
  queryInteger as createQueryInteger,
  queryNullableBoolean as createQueryNullableBoolean,
  queryNumber as createQueryNumber,
  queryString as createQueryString,
  queryUuid as createQueryUuid,
  queryUuidOrUri as createQueryUuidOrUri,
  withQueryContract as attachPlatformQueryContract,
} from '@vouchington/pagination'
import type {
  AnyQueryContractCarrier,
  QueryArrayItemContract,
  QueryBooleanContract,
  QueryCsvArrayContract,
  QueryEnumContract,
  QueryIntegerContract,
  QueryNullableBooleanContract,
  QueryNumberContract,
  QueryContract,
  QueryContractCarrier,
  QueryParameterContract,
  QueryStringContract,
  QueryUuidOrUriContract,
  ValidatedQueryContractCarriers,
} from './query-contract-types.mts'

export type * from './query-contract-types.mts'

type DescriptorOptions<TDescription extends string | undefined> = {
  readonly description?: TDescription
}

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer TIntersection,
) => void
  ? TIntersection
  : never

type ComposedQueryContract<TSources extends readonly AnyQueryContractCarrier[]> =
  UnionToIntersection<TSources[number]['queryContract']>

type QueryContractShape = Readonly<
  Record<string, { readonly kind: QueryParameterContract['kind'] }>
>

export function defineQueryContract<const TContract extends QueryContractShape>(
  queryContract: TContract,
  ..._compileTimeCheck: TContract extends QueryContract ? [] : [invalidContract: never]
): QueryContractCarrier<TContract> {
  return definePlatformQueryContract(
    queryContract as QueryContract,
  ) as QueryContractCarrier<TContract>
}

export function composeQueryContracts<const TSources extends readonly AnyQueryContractCarrier[]>(
  ...sources: TSources & ValidatedQueryContractCarriers<TSources>
): QueryContractCarrier<ComposedQueryContract<TSources>> {
  return composePlatformQueryContracts(...sources) as QueryContractCarrier<
    ComposedQueryContract<TSources>
  >
}

export function withQueryContract<
  TFunction extends (...args: never[]) => unknown,
  const TSources extends readonly AnyQueryContractCarrier[],
>(
  fn: TFunction,
  ...sources: TSources & ValidatedQueryContractCarriers<TSources>
): TFunction & QueryContractCarrier<ComposedQueryContract<TSources>> {
  return attachPlatformQueryContract(fn, ...sources) as TFunction &
    QueryContractCarrier<ComposedQueryContract<TSources>>
}

export function queryString<const TDescription extends string | undefined = undefined>(
  options: DescriptorOptions<TDescription> = {},
): QueryStringContract<undefined, TDescription> {
  return createQueryString<undefined, TDescription>(options)
}

export function queryUuid<const TDescription extends string | undefined = undefined>(
  options: DescriptorOptions<TDescription> = {},
): QueryStringContract<'uuid', TDescription> {
  return createQueryUuid<TDescription>(options)
}

export function queryUuidOrUri<const TDescription extends string | undefined = undefined>(
  options: DescriptorOptions<TDescription> = {},
): QueryUuidOrUriContract<TDescription> {
  return createQueryUuidOrUri<TDescription>(options)
}

export function queryBoolean<const TDescription extends string | undefined = undefined>(
  options: DescriptorOptions<TDescription> = {},
): QueryBooleanContract<TDescription> {
  return createQueryBoolean<TDescription>(options)
}

export function queryNullableBoolean<const TDescription extends string | undefined = undefined>(
  options: DescriptorOptions<TDescription> = {},
): QueryNullableBooleanContract<TDescription> {
  return createQueryNullableBoolean<TDescription>(options)
}

export function queryNumber<const TDescription extends string | undefined = undefined>(
  options: DescriptorOptions<TDescription> = {},
): QueryNumberContract<TDescription> {
  return createQueryNumber<TDescription>(options)
}

export function queryInteger<
  const TMinimum extends number,
  const TMaximum extends number,
  const TDefault extends number | undefined = undefined,
  const TDescription extends string | undefined = undefined,
>(
  bounds: { readonly minimum: TMinimum; readonly maximum: TMaximum; readonly default?: TDefault },
  options: DescriptorOptions<TDescription> = {},
): QueryIntegerContract<TMinimum, TMaximum, TDefault, TDescription> {
  return createQueryInteger<TMinimum, TMaximum, TDefault, TDescription>(bounds, options)
}

export function queryEnum<
  const TValues extends readonly string[],
  const TDescription extends string | undefined = undefined,
  const TDefault extends TValues[number] | undefined = undefined,
>(
  values: TValues,
  options: DescriptorOptions<TDescription> & { readonly default?: TDefault } = {},
): QueryEnumContract<TValues, TDescription, TDefault> {
  return createQueryEnum<TValues, TDescription, TDefault>(values, options)
}

export function queryCsvArray<
  const TItems extends QueryArrayItemContract,
  const TDescription extends string | undefined = undefined,
>(
  items: TItems,
  options: DescriptorOptions<TDescription> = {},
): QueryCsvArrayContract<TItems, TDescription> {
  return createQueryCsvArray<TItems, TDescription>(items, options)
}
