# Lambda Packages

Before adding or changing a Lambda that bridges an AWS event to the backend, load the
[event-ingress-routing skill](../.agents/skills/event-ingress-routing/SKILL.md) — it decides
in-VPC enqueue-only Lambda vs. public endpoint and requires a Lambda in this path to enqueue
only, never do external IO.

- [Lambda package reference](README.md)
