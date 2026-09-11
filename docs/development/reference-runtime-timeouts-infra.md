# Infra

[Back to Runtime Timeouts](runtime-timeouts.md#infra)

| Resource                    | File                                                     | Value           | Note                                                                      |
| --------------------------- | -------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- |
| DB rotation redeploy Lambda | `vouchington-infra/opentofu/ecs-db-rotation-redeploy.tf` | `timeout = 420` | Covers the 330s `SSM_REDEPLOY_DELAY_SECONDS` sleep plus redeploy overhead |
