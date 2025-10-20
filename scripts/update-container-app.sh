#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Minimal container image refresh for the CES3 badge arena app.
RESOURCE_GROUP=${RESOURCE_GROUP:-ces3}
APP_NAME=${APP_NAME:-ces3-badge-arena}
ACR_NAME=${ACR_NAME:-ces3badgeacr}

# Timestamp (UTC) and git hash form the tag, not the image name.
BUILD_TS=$(date -u +%Y%m%d-%H%M%S)
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")
IMAGE_TAG=${IMAGE_TAG:-${BUILD_TS}-${GIT_HASH}}

# Image name defaults to app name (no timestamp).
IMAGE_NAME=${IMAGE_NAME:-${APP_NAME}}

FULL_IMAGE="${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${IMAGE_TAG}"

log() {
  printf '==> %s\n' "$*"
}

log_error() {
  printf 'xx %s\n' "$*" >&2
}

require_cli() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Required CLI '$1' not found on PATH."
    exit 1
  fi
}

require_cli az
require_cli docker

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(cd -- "${SCRIPT_DIR}/.." && pwd)

# Build locally first to ensure we have the correct CSS
log "Building locally with bun..."
cd "${ROOT_DIR}"
rm -rf dist .output .tanstack node_modules/.vite
bun run build >/dev/null 2>&1 || {
  log_error "Local build failed. Cannot proceed with deployment."
  exit 1
}

# Temporarily allow dist in Docker build context
DOCKERIGNORE_BACKUP=""
if grep -q "^dist$" .dockerignore 2>/dev/null; then
  DOCKERIGNORE_BACKUP=$(cat .dockerignore)
  sed -i.bak '/^dist$/d' .dockerignore
  trap "echo '${DOCKERIGNORE_BACKUP}' > .dockerignore; rm -f .dockerignore.bak" EXIT
fi

SUBSCRIPTION_ID=${AZURE_SUBSCRIPTION_ID:-${SUBSCRIPTION_ID:-}}
if [[ -z "${SUBSCRIPTION_ID}" ]]; then
  SUBSCRIPTION_ID=$(az account show --query id -o tsv 2>/dev/null || true)
fi

if [[ -z "${SUBSCRIPTION_ID}" ]]; then
  log_error "Unable to determine Azure subscription. Pass AZURE_SUBSCRIPTION_ID or run 'az login'."
  exit 1
fi

SUBSCRIPTION_NAME=$(az account show --subscription "${SUBSCRIPTION_ID}" --query name -o tsv)
az account set --subscription "${SUBSCRIPTION_ID}" >/dev/null
log "Using subscription ${SUBSCRIPTION_NAME} (${SUBSCRIPTION_ID})."

log "Building container image ${FULL_IMAGE}..."
docker build --platform linux/amd64 -f "${ROOT_DIR}/Dockerfile.prebuilt" -t "${FULL_IMAGE}" "${ROOT_DIR}" >/dev/null

log "Authenticating with ACR ${ACR_NAME}..."
az acr login --name "${ACR_NAME}" >/dev/null

log "Pushing ${FULL_IMAGE}..."
docker push "${FULL_IMAGE}" >/dev/null

log "Updating container app ${APP_NAME}..."
az containerapp update \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${FULL_IMAGE}" \
  >/dev/null

log "Deployment complete."
FQDN=$(az containerapp show --name "${APP_NAME}" --resource-group "${RESOURCE_GROUP}" --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || true)
if [[ -n "${FQDN}" ]]; then
  log "App reachable at: https://${FQDN}"
fi

log "Image pushed: ${FULL_IMAGE}"
