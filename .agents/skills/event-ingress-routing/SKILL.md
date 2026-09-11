---
name: event-ingress-routing
description: Use before adding, changing, or reviewing an inbound AWS event (SNS/EventBridge) or third-party webhook path — decides in-VPC enqueue-only Lambda vs. public endpoint, whether an auth check is self-contained, and whether the path is real-time.
---

# Event Ingress Routing

Follow [`docs/overview/architecture/event-ingress.md`](../../../docs/overview/architecture/event-ingress.md)
for the routing rule, the mechanical definition of "self-contained" auth, the reference
implementation ([`backend/api/activitypub/inbox.mts`](../../../backend/api/activitypub/inbox.mts)),
and the decision checklist for a new event source.

Before adding a Lambda in the event-ingress path, coordinate the infrastructure change in the
private [`vouchington-infra`](https://github.com/vouchington/vouchington-infra) repository and
follow its OpenTofu instructions. Before adding or changing the queue/worker a Lambda enqueues into, read
[`backend/queues/CLAUDE.md`](../../../backend/queues/CLAUDE.md) and the
[voucha-queue-authoring skill](../voucha-queue-authoring/SKILL.md).
