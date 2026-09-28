# Request client information service

Source entrypoint: [backend/services/request-client-info/README.md](../../../../../backend/services/request-client-info/README.md)

Owns the Dynamic Config namespace controlling request client-information enforcement. Enforcement
defaults off so deployment can observe invalid traffic before rejecting it.

The request listener consumes `isRequestClientInfoEnforced`; staff manage the namespace through the
existing Dynamic Config admin registry.

See [the architecture contract](../../request-client-info.md).
