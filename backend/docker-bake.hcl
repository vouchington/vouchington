// Bake plan for the backend API and worker images. The build-backend-images
// composite action selects one Bake invocation for either API + worker-cpu or
// all three images, so the cache-busted shared builder stage executes once per run.
//
// Tags and OCI labels are layered in from `docker/metadata-action@v6`
// bake-files at workflow time, so this HCL file does not hard-code tags.
//
// Validation exports local images only; retained publisher workflows push verified
// images to GHCR. #10864 owns the durable, repository-independent remote cache and
// performance design. Private infrastructure owns production ECR promotion.

variable "GIT_COMMIT" {
  default = ""
}

// Validation outputs use `type=docker` so smoke tests can `docker run` the
// freshly-built images from the local daemon.
//
target "_common" {
  context         = "."
  dockerfile      = "backend/Dockerfile"
  platforms       = ["linux/arm64"]
  pull            = true
  no-cache-filter = ["base-node", "openssl-overlay"]
  args = {
    GIT_COMMIT = "${GIT_COMMIT}"
  }
  output = ["type=docker"]
}

target "api" {
  inherits = ["_common"]
  target   = "api"
}

target "worker-cpu" {
  inherits = ["_common"]
  target   = "worker-cpu"
}

target "worker-io" {
  inherits = ["_common"]
  target   = "worker-io"
}

group "default" {
  targets = ["api", "worker-cpu"]
}
