# Request client information service

Owns the Dynamic Config namespace controlling request client-information enforcement. Enforcement
defaults off so deployment can observe invalid traffic before rejecting it.

The request listener consumes `isRequestClientInfoEnforced`; staff manage the namespace through the
existing Dynamic Config admin registry.

See [the architecture contract](../../../docs/overview/architecture/request-client-info.md).
