# Networking reference

[Back to Networking](networking.md)

## AWS Application Endpoint Inventory

AWS's service-level IPv6 matrix is not sufficient proof for a particular SDK endpoint. The table
below records the endpoint actually selected for Voucha's region and client. Supported clients set
`useDualstackEndpoint: true` individually; there is deliberately no global
`AWS_USE_DUALSTACK_ENDPOINT` setting because Bedrock's generated `api.aws` names are not live DNS
endpoints.

| AWS API               | Caller                                              | Selected production endpoint                    | IPv6                                                                        | API direct-call allowlist                                                      |
| --------------------- | --------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| CloudWatch Metrics    | API and workers                                     | `monitoring.us-west-2.api.aws`                  | Yes; AAAA verified 2026-07-22                                               | **Allowed, exact host**                                                        |
| Kinesis Data Firehose | API and workers                                     | `firehose.us-west-2.api.aws`                    | Yes; AAAA verified 2026-07-22                                               | **Allowed, exact host**                                                        |
| S3                    | API and workers                                     | `[bucket.]s3.dualstack.us-west-2.amazonaws.com` | Yes; AAAA verified 2026-07-22                                               | **Allowed via exact dual-stack service suffix**                                |
| SES                   | API and workers                                     | `email.us-west-2.api.aws`                       | Yes; AAAA verified 2026-07-22                                               | **Allowed, exact host**                                                        |
| Bedrock control       | Workers                                             | `bedrock.us-east-1.amazonaws.com`               | No; A only                                                                  | No                                                                             |
| Bedrock Runtime       | Workers direct; API via provider HTTP CONNECT proxy | `bedrock-runtime.us-east-1.amazonaws.com`       | No; A only                                                                  | No; the API routes it through dual-stack `worker-cpu`, which keeps public IPv4 |
| S3                    | Image-resize Lambda                                 | AWS-managed regional S3 endpoint                | Service supports dual stack; Lambda client is not part of the API guardrail | N/A                                                                            |
| SSM Parameter Store   | Image-resize and SES Lambdas                        | AWS-managed regional SSM endpoint               | Service supports dual stack; Lambda client is not part of the API guardrail | N/A                                                                            |

The S3 virtual-hosted form requires the one suffix-based exception
`s3.dualstack.us-west-2.amazonaws.com`; the other AWS endpoints are exact allowlist entries.
Ordinary `amazonaws.com` endpoints and unaudited `api.aws` endpoints are not allowed. See
[AWS SDK dual-stack endpoint configuration](https://docs.aws.amazon.com/sdkref/latest/guide/feature-endpoints.html),
[AWS service IPv6 support](https://docs.aws.amazon.com/vpc/latest/userguide/aws-ipv6-support.html),
and the [Bedrock Runtime endpoint list](https://docs.aws.amazon.com/general/latest/gr/bedrock.html).

ECR image pulls, ECS log delivery, Secrets Manager, and SSM reads performed by the Fargate/ECS
control plane do not use the application's SDK client configuration. Their IPv6-only behavior must
be proven by the live task-launch test rather than inferred from the table above.

Two of those control-plane paths have a concrete dual-stack fix already in place rather than an
open question:

- **SSM Parameter Store secrets fetch** (`vouchington-infra/opentofu/vpc-endpoints.tf` `aws_vpc_endpoint.ssm`) is a
  private VPC interface endpoint with `private_dns_enabled = true`, which makes it DNS-authoritative
  for `ssm.${var.aws_region}.amazonaws.com` across the **entire VPC** — including the IPv6-only
  `ecs-ipv6-a`/`ecs-ipv6-b` subnets. It now also sets `ip_address_type = "dualstack"` so its own DNS
  record set includes AAAA; without that, an IPv6-only task's secrets fetch at startup would resolve
  to an IPv4-only address it cannot reach and fail the same way issue #8440 did, for a different
  reason.
- **ECR image pulls** use the ECR dual-stack pull host (`<id>.dkr-ecr.${var.aws_region}.on.aws`,
  `vouchington-infra/opentofu/locals.tf` `ecr_dualstack_host_replace`) because "Amazon ECR doesn't support dualstack
  interface VPC endpoints" — CI push paths are unaffected; they use the plain IPv4 endpoint
  directly.

ECS log delivery and Secrets Manager remain the open items: Secrets Manager has no VPC endpoint in
this repo at all (Aurora's AWS-managed master password is fetched over the public, IPv6-capable
Secrets Manager endpoint, covered by the `ecs_egress_all_ipv6` egress rule), and awslogs endpoint
selection for IPv6-only tasks is unverified — see the log-driver risk called out in the staging
verification gate below.

## IPv6-only Staging Verification Gate

This checklist defines the remaining operational gate for issue #7998; it is not evidence that the
gate has passed. The `ecs-ipv6-a`/`ecs-ipv6-b` subnets, the dual-stack Aurora/Valkey, and the `web`/
`api` task definitions that target them are provisioned by this change (`vouchington-infra/opentofu/vpc.tf`,
`aurora.tf`, `valkey.tf`, `ecs-backend.tf`, `ecs-web.tf`); issue #8000's original approach — reusing
the existing dual-stack public subnets — cannot work per AWS's own IPv6-only-subnet requirements
(see the epic plan), so this gate no longer depends on #8000 to supply a task. Because IPv6-only
tasks do not support ECS Exec, and the backend container is the distroless
`gcr.io/distroless/nodejs26-debian13:nonroot` image (no shell, no `dig`, a fixed
`/nodejs/bin/node` entrypoint — a `containerOverrides` command only selects that entrypoint's
arguments), gather the evidence by running the diagnostic entrypoint
`backend/entrypoints/api/verify-ipv6-egress.mts` as a one-off `aws ecs run-task` +
`containerOverrides` invocation. The private infrastructure deployment receiver owns this one-off
task mechanism and database migration without ECS Exec:

```sh
aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$BACKEND_TASK_DEFINITION" \
  --network-configuration "$NETWORK_CONFIGURATION" \
  --overrides '{"containerOverrides":[{"name":"backend","command":["--experimental-strip-types","--disable-warning=ExperimentalWarning","verify-ipv6-egress.mts"]}]}'
```

Retrieve its output from the task's CloudWatch Logs stream after it exits.

Before launching that task, verify every field in the `api-egress-proxy` DynamicConfig namespace
reads `true`: `openai_moderation_enabled`, `apple_oauth_enabled`, `github_oauth_enabled`,
`x_oauth_enabled`, `bluesky_oauth_enabled`, `fediverse_search_enabled`, `stripe_enabled`, and
`bedrock_embeddings_enabled`. All eight default `true` in deployed environments, but an operator
override can still leave one `false`.
Capture the values with the task evidence; an unset or false flag means the corresponding API path
still dials its IPv4-only provider directly.

Leave `activitypub-inbox.async_delivery_enabled` at its default `false` for this gate. Unlike the flags
above, it does not reroute a known IPv4-only dependency — remote actor servers are arbitrary
third-party hosts, not a fixed endpoint — so it has no bearing on this cutover. It has its own
independent rollout gate (`docs/requirements/content/FEDIVERSE.md`,
`docs/operations/reference-fediverse-staging-interop-procedure.md`) governing when `POST /ap/inbox`
may switch from synchronous actor/signature verification to async `202` ingestion, and that staged
validation must pass on its own before the flag is ever turned on.

The task-start check must perform and retain these steps:

1. `verify-ipv6-egress.mts` records task route evidence first and throws (failing the task) if it
   finds a non-loopback IPv4 address or no non-loopback IPv6 address — the run must not proceed on
   a task that isn't actually IPv6-only.
2. For every host in `backend/modules/utils/ipv6-allowlist.mts`'s `IPV6_ALLOWLIST`, the
   configured `SENTRY_DSN` authority, and the dual-stack S3 host, the script resolves A/AAAA via
   `node:dns/promises` and makes an HTTPS `HEAD` request via `getExternalFetch()`. It fails
   (non-zero exit) if the deployed `SENTRY_DSN` is unset or invalid, if any host has no AAAA answer,
   or if the HTTPS request throws, and prints the complete per-host DNS answers and TLS result as
   JSON — attach that output rather than a yes/no summary. A non-2xx HTTP response still counts as
   reachable; only a network-level failure (timeout, connection refused, DNS failure) fails the
   check, since the goal is proving the IPv6 route and TLS handshake succeed, not exercising each
   endpoint's auth.
3. For authenticated APIs, separately run the application's normal staging smoke flow so the
   actual SDK/client and credentials are exercised; the script's TLS check alone does not prove
   authenticated calls succeed.
4. Exercise CloudWatch metric publishing, Firehose delivery, S3 read/write, SES delivery, Sentry,
   captcha verification, Web Risk, and every IPv6-capable OAuth path. Confirm the API egress
   guardrail reports no unexpected direct hostname.
5. With `bedrock_embeddings_enabled=true`, exercise a public
   `?semantic_search_query=` request against the IPv6-only `api` task and confirm it returns real
   results rather than a cache-only fallback — that proves the call went `api` → Service Connect →
   the CPU worker's Squid sidecar → Bedrock Runtime, the mechanism that unblocks
   IPv6-only `api` without Bedrock itself ever needing IPv6. Attach the task definition revision,
   route/interface output, DynamicConfig snapshot, DNS answers, per-integration result, guardrail
   log query, and timestamps to #7998.

The final task-addressing and cost/topology rewrite belongs to issue #8001 after the IPv6-only
cutover. This inventory records current endpoint facts without claiming that cutover is complete.

## ALB IPv6 Frontend

The ALB uses `ip_address_type = "dualstack-without-public-ipv4"`: Cloudflare connects to the ALB
over IPv6, while end-user IPv4 terminates at Cloudflare's edge. This removes roughly $7/mo in ALB
public IPv4 charges without changing the proxied Cloudflare CNAME. The `backend`/`web` target
groups were later replaced with `ip_address_type = "ipv6"` to match `api`/`web` moving to IPv6-only
ECS subnets — a separate change from this address-type flip, but noted here since both touch the
same target groups.

After an address-type change applies to staging, follow Step 29 of the operator checklist (the
first-deploy checklist in the private `vouchington-infra` repository) to verify that the ALB
publishes AAAA but not A records and that both web and API traffic work through Cloudflare Full
(Strict). Direct public-IPv4 probes of the ALB no longer work.

> The ALB-native IdP (Cognito) authentication feature requires IPv4, but Voucha's
> authentication is implemented in-app via the backend service — that caveat does not apply.
