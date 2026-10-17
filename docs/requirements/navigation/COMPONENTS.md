# UI Components

## Canonical Entity List-Item Components

Every entity type has exactly one canonical list-item or card component. All list surfaces (public
discovery pages, `/my/*` pages, public-profile tabs, asides, and dropdowns) must render through
that component, and no surface may re-implement the entity row inline. This keeps actions, badges,
and privacy behavior consistent everywhere an entity appears.

## Contents

- <a id="rsc-boundary-view-models"></a>[RSC boundary view models](reference-components-rsc-boundary-view-models.md)
- <a id="patterns"></a>[Patterns](reference-components-patterns.md)
