-- Explicit OG dependency manifests. Each entry is a placement the rendered card may embed.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE open_graph_dependency_manifests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE open_graph_dependency_manifest_placements (
  manifest_id uuid NOT NULL REFERENCES open_graph_dependency_manifests (id) ON DELETE RESTRICT,
  placement_id uuid NOT NULL,
  image_id uuid NOT NULL,
  placement_revision integer NOT NULL CHECK (placement_revision >= 0),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (manifest_id, ordinal),
  UNIQUE (manifest_id, placement_id)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_open_graph_dependency_manifest_placements__placement
  ON open_graph_dependency_manifest_placements (placement_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_open_graph_dependency_manifest_placements__image
  ON open_graph_dependency_manifest_placements (image_id);

ALTER TABLE open_graph_dependency_manifest_placements
  ADD CONSTRAINT fk_open_graph_dependency_manifest_placements__placement
  FOREIGN KEY (placement_id) REFERENCES media_placements (id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE open_graph_dependency_manifest_placements
  VALIDATE CONSTRAINT fk_open_graph_dependency_manifest_placements__placement;

ALTER TABLE open_graph_dependency_manifest_placements
  ADD CONSTRAINT fk_open_graph_dependency_manifest_placements__image
  FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE open_graph_dependency_manifest_placements
  VALIDATE CONSTRAINT fk_open_graph_dependency_manifest_placements__image;

COMMENT ON TABLE open_graph_dependency_manifests IS
  'Registered set of placement dependencies for one OG render. Unknown manifests are not delivery authority.';
COMMENT ON TABLE open_graph_dependency_manifest_placements IS
  'One source placement embedded by an OG manifest. Authorization uses the recorded revision, not a later sibling.';
COMMENT ON COLUMN open_graph_dependency_manifest_placements.manifest_id IS
  'Manifest that registered this dependency. Entries do not outlive that manifest.';
COMMENT ON COLUMN open_graph_dependency_manifest_placements.placement_id IS
  'Stable media placement the rendered card may embed.';
COMMENT ON COLUMN open_graph_dependency_manifest_placements.image_id IS
  'Immutable image bound to the recorded placement.';
COMMENT ON COLUMN open_graph_dependency_manifest_placements.ordinal IS
  'Zero-based order of this dependency within the manifest.';
COMMENT ON COLUMN open_graph_dependency_manifest_placements.placement_revision IS
  'Placement revision observed at registration. A later revision does not satisfy this dependency.';
