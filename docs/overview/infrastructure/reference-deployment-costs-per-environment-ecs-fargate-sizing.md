# ECS Fargate sizing

[Back to per-environment AWS costs](reference-deployment-costs-per-environment-aws-costs.md)

## Three services

| Service    | CPU | Memory  | Image        |
| ---------- | --- | ------- | ------------ |
| backend    | 512 | 1024 MB | `api`        |
| web        | 512 | 1024 MB | `web`        |
| worker-cpu | 512 | 1024 MB | `worker-cpu` |

In staging, each service runs `desired_count=1` on **FARGATE_SPOT** with no
on-demand baseline. This lowers the always-on staging bill, but a single-task
service can be interrupted or delayed when Spot capacity is unavailable. In
production, web and api keep `base = 1` on on-demand FARGATE with FARGATE_SPOT
only for scale-out above that baseline; worker services run Spot-only in every
environment (queues self-heal from durable state, so a Spot reclaim there is
safe without a standing on-demand task).
Only `worker-cpu` sets `assign_public_ip = true`, trading a NAT gateway for a per-task public IPv4
charge (~$3.60/mo/task) — cheaper among managed options at this scale (1–2 worker tasks).
`backend`/`web` sidestep the tradeoff entirely: they run in the IPv6-only ECS subnets
(`assign_public_ip = false`) instead of paying for either option — see
[Networking](networking.md).

This estimate assumes one deployed `worker-cpu` task and no deployed `worker-io` task. Filaments
automatically publishes `worker-cpu`; `worker-io` publication is disabled by the checked-in
`WORKER_IO_AUTOMATION_ENABLED` flag and remains available for recovery. The private
`vouchington-infra` repository owns the live worker service count and task sizing. Recalculate the
Fargate and public IPv4 totals from that source of truth whenever its worker placement changes.
