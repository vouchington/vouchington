# Vendored (do not modify)

[Back to Runtime Timeouts](runtime-timeouts.md#vendored-do-not-modify)

| Component          | File                                                                                             | Value          | Note                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------- |
| SOCI index builder | `vouchington-infra/opentofu/soci-index-builder.cfn.yml` (×2, plus one intentionally-omitted 3rd) | `Timeout: 900` | Vendored from upstream `awslabs` (commit `770e9a5e`) — do not hand-tune |
