# Public IPv4 subtotal

[Back to per-environment AWS costs](reference-deployment-costs-per-environment-aws-costs.md#public-ipv4-subtotal)

| Component                                                             | Count | Est. $/mo/env |
| --------------------------------------------------------------------- | ----- | ------------- |
| ECS task public IPs (one `worker-cpu`; `backend`/`web` are IPv6-only) | 1     | ~$4           |
| ALB public IPs (`dualstack-without-public-ipv4`)                      | 0     | $0            |
| **Total**                                                             |       | **~$4**       |
