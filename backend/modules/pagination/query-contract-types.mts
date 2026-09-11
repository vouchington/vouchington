type LiteralOption<TKey extends PropertyKey, TValue> = [TValue] extends [undefined]
  ? {}
  : [undefined] extends [TValue]
    ? { readonly [TProperty in TKey]?: Exclude<TValue, undefined> }
    : { readonly [TProperty in TKey]: TValue }

type DescriptionOption<TDescription extends string | undefined> = LiteralOption<
  'description',
  TDescription
>

export type QueryStringContract<
  TFormat extends 'uuid' | 'uri' | undefined = undefined,
  TDescription extends string | undefined = undefined,
> = { readonly kind: 'string' } & LiteralOption<'format', TFormat> & DescriptionOption<TDescription>

export type QueryUuidOrUriContract<TDescription extends string | undefined = undefined> = {
  readonly kind: 'uuid-or-uri'
} & DescriptionOption<TDescription>

export type QueryBooleanContract<TDescription extends string | undefined = undefined> = {
  readonly kind: 'boolean'
} & DescriptionOption<TDescription>

export type QueryNullableBooleanContract<TDescription extends string | undefined = undefined> = {
  readonly kind: 'nullable-boolean'
} & DescriptionOption<TDescription>

export type QueryNumberContract<TDescription extends string | undefined = undefined> = {
  readonly kind: 'number'
} & DescriptionOption<TDescription>

export type QueryIntegerContract<
  TMinimum extends number = number,
  TMaximum extends number = number,
  TDefault extends number | undefined = undefined,
  TDescription extends string | undefined = undefined,
> = {
  readonly kind: 'integer'
  readonly minimum: TMinimum
  readonly maximum: TMaximum
} & LiteralOption<'default', TDefault> &
  DescriptionOption<TDescription>

export type QueryEnumContract<
  TValues extends readonly string[] = readonly string[],
  TDescription extends string | undefined = undefined,
  TDefault extends TValues[number] | undefined = undefined,
> = {
  readonly kind: 'enum'
  readonly values: TValues
} & DescriptionOption<TDescription> &
  LiteralOption<'default', TDefault>

export type QueryArrayItemContract =
  | QueryStringContract<'uuid' | 'uri' | undefined, string | undefined>
  | QueryEnumContract<readonly string[], string | undefined, string | undefined>

export type QueryCsvArrayContract<
  TItems extends QueryArrayItemContract = QueryArrayItemContract,
  TDescription extends string | undefined = undefined,
> = {
  readonly kind: 'csv-array'
  readonly items: TItems
  readonly style: 'form'
  readonly explode: false
} & DescriptionOption<TDescription>

export type QueryParameterContract =
  | QueryStringContract<'uuid' | 'uri' | undefined, string | undefined>
  | QueryUuidOrUriContract<string | undefined>
  | QueryBooleanContract<string | undefined>
  | QueryNullableBooleanContract<string | undefined>
  | QueryNumberContract<string | undefined>
  | QueryIntegerContract<number, number, number | undefined, string | undefined>
  | QueryEnumContract<readonly string[], string | undefined, string | undefined>
  | QueryCsvArrayContract<QueryArrayItemContract, string | undefined>

export type QueryContract = Readonly<Record<string, QueryParameterContract>>

export type QueryContractCarrier<TContract = QueryContract> = {
  readonly queryContract: TContract
}

export type AnyQueryContractCarrier = QueryContractCarrier<Readonly<Record<string, unknown>>>

export type ValidatedQueryContractCarriers<TSources extends readonly AnyQueryContractCarrier[]> = {
  readonly [TIndex in keyof TSources]: TSources[TIndex] extends QueryContractCarrier<
    infer TContract
  >
    ? TContract extends QueryContract
      ? TSources[TIndex]
      : never
    : never
}
