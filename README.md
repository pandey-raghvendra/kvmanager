# 🔐 KV Manager

Azure Key Vault Secret Manager — local web UI powered by `az cli`. No Entra app registration needed.

## Prerequisites

- Node.js 18+
- Azure CLI (`brew install azure-cli`)
- Logged in to Azure (`az login`)
- Key Vault Secrets Officer (or higher) on the vaults you want to manage

## Quick Start

```bash
chmod +x start.sh
./start.sh
```

Then open: http://localhost:3000

## Features

- 🔍 Browse all subscriptions and Key Vaults
- 👁️ Reveal / hide secret values on demand
- ➕ Add new secrets
- ✏️ Edit existing secrets with content type
- 🗑️ Delete secrets (soft-delete, recoverable)
- 📥 Bulk import from CSV
- 📋 Copy secrets between vaults
- 🔄 Filter vaults and secrets by name

## Bulk Import CSV Format

```
SecretName,SecretValue,ContentType
DbConnectionString,Server=tcp:myserver.database.windows.net,ConnectionString
MailgunApiKey,key-abc123,ApiKey
AppInsightsKey,00000000-0000-0000-0000-000000000000,InstrumentationKey
```

ContentType column is optional.

## Copy Between Vaults

1. Select secrets using the checkboxes
2. Click "Copy N selected"
3. Choose target vault
4. Done — values are fetched from source and written to target

## Switch Subscription

Use the subscription dropdown in the sidebar. Vault list refreshes automatically.

## Security Notes

- Runs on localhost only — not exposed to network
- Uses your existing `az login` session
- Secret values are only fetched when you click the eye icon (lazy loaded)
- No secrets are logged or stored locally
