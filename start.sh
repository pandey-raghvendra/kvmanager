#!/bin/bash
set -e

echo ""
echo "🔐 KV Manager — Azure Key Vault Secret Manager"
echo "================================================"
echo ""

# Check az cli is installed
if ! command -v az &> /dev/null; then
  echo "❌ Azure CLI not found. Install it first:"
  echo "   brew install azure-cli"
  exit 1
fi

# Check az cli is logged in
echo "⏳ Checking Azure login status..."
ACCOUNT=$(az account show --output json 2>/dev/null || echo "")
if [ -z "$ACCOUNT" ]; then
  echo "❌ Not logged in to Azure CLI. Run:"
  echo "   az login"
  exit 1
fi

USER=$(echo $ACCOUNT | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['name'])" 2>/dev/null || echo "unknown")
SUB=$(echo $ACCOUNT | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])" 2>/dev/null || echo "unknown")
echo "✅ Logged in as: $USER"
echo "✅ Default subscription: $SUB"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

echo "🚀 Starting server at http://localhost:3000"
echo "   Press Ctrl+C to stop"
echo ""

node server.js
