# Monetary Values

Voucha represents first-party money as currency-aware integers. Ordinary `Money` and
`ScaledMoney` follow Stripe's wire convention: lowercase ISO 4217 currency codes and numeric
integer amounts. MRR and community AI cost totals carry their unbounded same-currency integer
smallest-unit totals as canonical digit strings so JSON cannot round them. No contract uses binary
floating-point or a decimal major-unit string for money.

## Currency Catalog

`currencies` is the authoritative catalog:

```sql
CREATE TABLE currencies (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z]{3}$'),
  minor_unit_exponent SMALLINT NOT NULL CHECK (minor_unit_exponent BETWEEN 0 AND 4)
);
```

The exponent converts a major-unit amount to its ordinary minor unit. For example, USD has exponent
2, so USD 12.34 is 1,234 minor units. JPY has exponent 0, so JPY 1,234 is 1,234 minor units.
`GET /api/v1/currencies` exposes the catalog as a cursor-paginated list of
`{ code, minor_unit_exponent }`. Clients use their locale libraries for names, symbols, grouping,
and display; those presentation values are not stored.

## Public Types

All public first-party APIs use these structural contracts:

```ts
type Money = {
  amount: number
  currency: CurrencyCode
}

type ScaledMoney = Money & {
  scale: 6
}

type ScaledMoneyAggregate = {
  amount: string
  currency: CurrencyCode
  scale: 6
}

type MoneyRange = {
  minimum: Money
  maximum: Money | null
}
```

- `Money.amount` is an integer in the currency's minor unit.
- `ScaledMoney.amount` is an integer in millionths of the major currency unit. It is used when a
  value can be smaller than the ordinary minor unit or an aggregate can produce a fraction of one.
- `MoneyRange.minimum` is inclusive. A non-null `maximum` is exclusive, greater than `minimum`,
  and uses the same currency. A null maximum means no upper bound.
- `Money.amount` and `ScaledMoney.amount` are non-negative JSON-safe integers. Business rules may
  impose a narrower range or require a positive value.
- `ScaledMoneyAggregate.amount` is a canonical non-negative integer string. MRR and community AI
  cost totals use it because their scale-six same-currency totals may exceed the JSON-safe integer
  range.

Point valuations use `ScaledMoney`. A Hilton point valued at USD 0.035 is:

```json
{ "amount": 35000, "currency": "usd", "scale": 6 }
```

Their business range is 0 through 9,999,999,999 microunits, inclusive. This is 0 through
9,999.999999 major currency units.

The stored integer is a millionth of the major unit, not a decimal PostgreSQL value. Although this
precision is sometimes described conversationally as microcents, the canonical unit is a
microunit of the major currency. One USD microcent would require a finer scale and is not the
contract.

## Exact Input and Formatting

Human-entered major-unit values are parsed from plain decimal strings with integer arithmetic:

- no signs, exponents, grouping separators, or locale-dependent decimal marks at the parsing layer;
- no more fractional digits than the target exponent or scale;
- no conversion through JavaScript `Number` before scaling;
- no acceptance followed by silent database rounding.

UI layers localize input and display around this exact boundary. Shared TypeScript parsing and
validation live in [`ts-shared/money/`](../../../ts-shared/money/), which configures
`@vouchington/utils/money` with Voucha's catalog and translates catalog metadata to the public
`minor_unit_exponent` shape. Controlled web money inputs
normalize the active locale's decimal separator to the canonical dot before exact parsing, while
also accepting a canonical dot. They never remove or interpret grouping separators. Swift and .NET
mirror the same integer model and use locale-aware formatters.

## PostgreSQL Contract

Persisted first-party monetary values use:

- `BIGINT` columns named `*_minor_units` for ordinary money;
- `BIGINT` columns named `*_microunits` for scale-six money;
- a lowercase `currency_code` foreign key to `currencies(code)`;
- constraints that keep amounts within their business range and the JSON-safe integer maximum.

Tables may use one record-wide currency or a field-specific `*_currency_code` when independent
values require it. A profile or structured data point has one record currency, and all nested money
must match it. Changing that currency replaces or clears its monetary values atomically.

Do not use `NUMERIC`, `DECIMAL`, `REAL`, or `DOUBLE PRECISION` for stored money. PostgreSQL's exact
`NUMERIC` result for `SUM(BIGINT)` may be serialized directly to a canonical integer string for an
unbounded aggregate. Do not expose database unit names in public contracts; serializers produce
`Money`, `ScaledMoney`, or the aggregate-only `ScaledMoneyAggregate`.

## Aggregation and Rounding

- Never add amounts from different currencies. Revenue and monetary analytics group by currency.
- MRR first sums monthly and yearly prices per currency, converts the totals to scale six, divides
  the yearly total by 12, and rounds half-up once. The API returns `mrr_by_currency:
ScaledMoneyAggregate[]`. Its string amount preserves a valid maximum membership price and
  same-currency totals of any size without clipping or floating-point conversion.
- Credit-limit medians use the lower observed `Money` value for even samples. This discrete median
  preserves the complete JSON-safe `Money` domain without unsafe scale-six multiplication.
- Bounded aggregates that intentionally interpolate between ordinary minor units return
  `ScaledMoney` only when their business domain guarantees the normalized amount remains JSON-safe.
  Unbounded MRR and community AI cost totals return `ScaledMoneyAggregate`.
- AI price constants are integer microunits per million tokens. Cost calculation uses `BigInt`
  arithmetic and rounds half-up once per request. Unknown model pricing stores a null cost with
  `pricing_status = 'unpriced'`; aggregate responses report `unpriced_request_count` and exact
  `ScaledMoneyAggregate` totals.

## Provider-Raw Exception

Raw external-provider payloads remain faithful to the provider. In particular, Stripe webhook and
SDK fields may use provider-defined names and currency codes that are not in Voucha's catalog.
Webhook ingestion must not retry forever merely because a new provider currency is unknown.

The exception ends at the provider boundary. First-party tables, API responses, tools, fixtures,
and client models normalize provider amounts to the integer money contracts. Any persisted raw
payload stays explicitly provider-owned and is not used as the first-party financial ledger.

## Pre-Launch Migration Policy

The application has not launched. The original never-deployed migrations are edited in place,
development and test databases are reset, and schema snapshots are regenerated. There are no
compatibility columns, decimal fallbacks, or backfills for the superseded representation.

The `repo-file-policy` monetary contract guard protects the final state. It rejects decimal or
floating-point monetary storage, ambiguous cents/dollars database names, integer money without a
currency association, and old or storage-shaped first-party public fields.

## Related

- [Membership requirements](../../requirements/users/memberships.md)
- [Data point requirements](../../requirements/platform/data-points-spec.md)
- [Growth dashboard requirements](../../requirements/admin/GROWTH-DASHBOARD.md)
- [PostgreSQL data store](../../../backend/data-stores/psql/README.md)
- [Web workspace rules](../../../web/CLAUDE.md)
- [Native client workspace rules](https://github.com/vouchington/vouchington-clients)
