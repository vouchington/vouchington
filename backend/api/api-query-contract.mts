import type {
  AnyQueryContractCarrier,
  ValidatedQueryContractCarriers,
} from '@vouchington/pagination'

/** Preserve compile-time validation of this application's query carriers. */
export function apiQuery<
  const TSources extends readonly [AnyQueryContractCarrier, ...AnyQueryContractCarrier[]],
>(_key: string, ..._sources: TSources & ValidatedQueryContractCarriers<TSources>): void {
  return undefined
}
