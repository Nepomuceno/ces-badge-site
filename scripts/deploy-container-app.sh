#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Opinionated defaults for the CES3 badge arena deployment.
RESOURCE_GROUP=${RESOURCE_GROUP:-ces3}
LOCATION=${LOCATION:-uksouth}
APP_NAME=${APP_NAME:-ces3-badge-arena}
ENV_NAME=${ENV_NAME:-ces3-badge-env}
ACR_NAME=${ACR_NAME:-ces3badgeacr}
LOG_ANALYTICS_NAME=${LOG_ANALYTICS_NAME:-ces3-badge-law}
PORT=${PORT:-80}
DATA_DIR=${DATA_DIR:-/app/data}
IMAGE_NAME=${IMAGE_NAME:-${APP_NAME}}
IMAGE_TAG=${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}
FULL_IMAGE="${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${IMAGE_TAG}"
STORAGE_ACCOUNT_NAME=${STORAGE_ACCOUNT_NAME:-${APP_NAME//[^[:alnum:]]/}}
STORAGE_SHARE_NAME=${STORAGE_SHARE_NAME:-badgedata}
STORAGE_SHARE_QUOTA_GB=${STORAGE_SHARE_QUOTA_GB:-5}
STORAGE_VOLUME_NAME=${STORAGE_VOLUME_NAME:-badgefiles}
PLACEHOLDER_IMAGE=${PLACEHOLDER_IMAGE:-mcr.microsoft.com/k8se/quickstart:latest}
SECURITY_TAG="SecurityControl=Ignore"

log() {
  printf '==> %s\n' "$*"
}

log_error() {
  printf 'xx %s\n' "$*" >&2
}

if ! command -v az >/dev/null 2>&1; then
  log_error "Azure CLI (az) is required."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  log_error "Docker CLI is required."
  exit 1
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
TENANT_ID=$(az account show --subscription "${SUBSCRIPTION_ID}" --query tenantId -o tsv)
az account set --subscription "${SUBSCRIPTION_ID}" >/dev/null

log "Using subscription ${SUBSCRIPTION_NAME} (${SUBSCRIPTION_ID}) in tenant ${TENANT_ID}."

ensure_provider() {
  local namespace=$1
  local state
  state=$(az provider show --namespace "${namespace}" --query registrationState -o tsv 2>/dev/null || echo "NotRegistered")
  if [[ "${state}" != "Registered" ]]; then
    log "Registering resource provider ${namespace}..."
    az provider register --namespace "${namespace}" --wait >/dev/null
  fi
}

# Providers needed for Container Apps + storage.
ensure_provider "Microsoft.App"
ensure_provider "Microsoft.ContainerRegistry"
ensure_provider "Microsoft.OperationalInsights"
ensure_provider "Microsoft.Storage"

# Normalize the storage account name to meet Azure rules.
STORAGE_ACCOUNT_NAME=$(echo "${STORAGE_ACCOUNT_NAME}" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')
if [[ ${#STORAGE_ACCOUNT_NAME} -lt 3 || ${#STORAGE_ACCOUNT_NAME} -gt 24 ]]; then
  STORAGE_ACCOUNT_NAME="${APP_NAME//[^[:alnum:]]/}store"
  STORAGE_ACCOUNT_NAME=$(echo "${STORAGE_ACCOUNT_NAME}" | tr '[:upper:]' '[:lower:]' | cut -c1-24)
fi

log "Ensuring resource group ${RESOURCE_GROUP} in ${LOCATION}..."
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" --tags "${SECURITY_TAG}" >/dev/null

log "Ensuring storage account ${STORAGE_ACCOUNT_NAME}..."
if ! az storage account show --name "${STORAGE_ACCOUNT_NAME}" --resource-group "${RESOURCE_GROUP}" >/dev/null 2>&1; then
  az storage account create \
    --name "${STORAGE_ACCOUNT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --location "${LOCATION}" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --tags "${SECURITY_TAG}" \
    >/dev/null
  log "Created storage account ${STORAGE_ACCOUNT_NAME}."
fi

log "Ensuring shared key access is enabled on ${STORAGE_ACCOUNT_NAME}..."
az storage account update \
  --name "${STORAGE_ACCOUNT_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --allow-shared-key-access true \
  >/dev/null

STORAGE_ACCOUNT_KEY=$(az storage account keys list --resource-group "${RESOURCE_GROUP}" --account-name "${STORAGE_ACCOUNT_NAME}" --query '[0].value' -o tsv)
log "Ensuring Azure Files share ${STORAGE_SHARE_NAME}..."
az storage share create \
  --name "${STORAGE_SHARE_NAME}" \
  --account-name "${STORAGE_ACCOUNT_NAME}" \
  --account-key "${STORAGE_ACCOUNT_KEY}" \
  --quota "${STORAGE_SHARE_QUOTA_GB}" \
  >/dev/null

log "Ensuring Azure Container Registry ${ACR_NAME}..."
if ! az acr show --name "${ACR_NAME}" --resource-group "${RESOURCE_GROUP}" >/dev/null 2>&1; then
  az acr create \
    --name "${ACR_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --location "${LOCATION}" \
    --sku Basic \
    --admin-enabled true \
    --tags "${SECURITY_TAG}" \
    >/dev/null
  log "Created ACR ${ACR_NAME}."
fi

LOGIN_SERVER=$(az acr show --name "${ACR_NAME}" --resource-group "${RESOURCE_GROUP}" --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name "${ACR_NAME}" --resource-group "${RESOURCE_GROUP}" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "${ACR_NAME}" --resource-group "${RESOURCE_GROUP}" --query passwords[0].value -o tsv)

log "Building container image ${FULL_IMAGE}..."
docker build --platform linux/amd64 -t "${FULL_IMAGE}" .

log "Authenticating with ACR ${ACR_NAME}..."
az acr login --name "${ACR_NAME}" >/dev/null

log "Pushing ${FULL_IMAGE}..."
docker push "${FULL_IMAGE}"

log "Ensuring Log Analytics workspace ${LOG_ANALYTICS_NAME}..."
if ! az monitor log-analytics workspace show --resource-group "${RESOURCE_GROUP}" --workspace-name "${LOG_ANALYTICS_NAME}" >/dev/null 2>&1; then
  az monitor log-analytics workspace create \
    --resource-group "${RESOURCE_GROUP}" \
    --workspace-name "${LOG_ANALYTICS_NAME}" \
    --location "${LOCATION}" \
    --sku PerGB2018 \
    --tags "${SECURITY_TAG}" \
    >/dev/null
  log "Created Log Analytics workspace ${LOG_ANALYTICS_NAME}."
fi

WORKSPACE_ID=$(az monitor log-analytics workspace show --resource-group "${RESOURCE_GROUP}" --workspace-name "${LOG_ANALYTICS_NAME}" --query customerId -o tsv)
WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys --resource-group "${RESOURCE_GROUP}" --workspace-name "${LOG_ANALYTICS_NAME}" --query primarySharedKey -o tsv)

log "Ensuring Container Apps environment ${ENV_NAME}..."
if ! az containerapp env show --name "${ENV_NAME}" --resource-group "${RESOURCE_GROUP}" >/dev/null 2>&1; then
  az containerapp env create \
    --name "${ENV_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --location "${LOCATION}" \
    --logs-workspace-id "${WORKSPACE_ID}" \
    --logs-workspace-key "${WORKSPACE_KEY}" \
    --tags "${SECURITY_TAG}" \
    >/dev/null
  log "Created Container Apps environment ${ENV_NAME}."
fi

log "Configuring Azure Files storage for ${ENV_NAME}..."
az containerapp env storage set \
  --name "${ENV_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --storage-name "${STORAGE_VOLUME_NAME}" \
  --storage-type AzureFile \
  --azure-file-account-name "${STORAGE_ACCOUNT_NAME}" \
  --azure-file-account-key "${STORAGE_ACCOUNT_KEY}" \
  --azure-file-share-name "${STORAGE_SHARE_NAME}" \
  --access-mode ReadWrite \
  >/dev/null

ENVIRONMENT_ID=$(az containerapp env show --name "${ENV_NAME}" --resource-group "${RESOURCE_GROUP}" --query id -o tsv)

log "Deploying Container App ${APP_NAME}..."
config_file=$(mktemp)
cat >"${config_file}" <<YAML
"name": "${APP_NAME}"
"location": "${LOCATION}"
"type": "Microsoft.App/ContainerApps"
"properties":
  "environmentId": "${ENVIRONMENT_ID}"
  "configuration":
    "ingress":
      "external": true
      "targetPort": ${PORT}
    "registries":
      - "server": "${LOGIN_SERVER}"
        "username": "${ACR_USERNAME}"
        "passwordSecretRef": "acr-password"
    "secrets":
      - "name": "acr-password"
        "value": "${ACR_PASSWORD}"
  "template":
    "containers":
      - "name": "${APP_NAME}"
        "image": "${FULL_IMAGE}"
        "env":
          - "name": "PORT"
            "value": "${PORT}"
          - "name": "DATA_DIR"
            "value": "${DATA_DIR}"
        "volumeMounts":
          - "mountPath": "${DATA_DIR}"
            "volumeName": "${STORAGE_VOLUME_NAME}"
    "volumes":
      - "name": "${STORAGE_VOLUME_NAME}"
        "storageType": "AzureFile"
        "storageName": "${STORAGE_VOLUME_NAME}"
YAML

if ! az containerapp show --name "${APP_NAME}" --resource-group "${RESOURCE_GROUP}" >/dev/null 2>&1; then
  az containerapp create --name "${APP_NAME}" --resource-group "${RESOURCE_GROUP}" --yaml "${config_file}" >/dev/null
else
  az containerapp update --name "${APP_NAME}" --resource-group "${RESOURCE_GROUP}" --yaml "${config_file}" >/dev/null
fi

rm -f "${config_file}"

log "Deployment complete."
log "Image pushed: ${FULL_IMAGE}"
