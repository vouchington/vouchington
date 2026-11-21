# Gemini Embeddings (local)

[Back to Dev Environment Reference](README.md#gemini-embeddings-local)

Local requests use the same AWS workload identity federation path as deployed workloads. Configure
a development Google Cloud project, its AWS identity provider, and a service account that the AWS
identity can impersonate. The standard AWS credential chain must resolve that permitted identity.
Google application default credentials are not an application authentication mode.

The [environment contract](../local-env-vars.md) owns the non-secret Vertex project, location,
bucket, and federation inputs. Follow the private infrastructure runbook to obtain those values;
keep AWS credentials in your normal local credential configuration, outside the repository.

After changing the local configuration, use the [managed local development workflow](README.md)
to regenerate the environment and restart services. Use an isolated development project rather
than staging or production resources.
