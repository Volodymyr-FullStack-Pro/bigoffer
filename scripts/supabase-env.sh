#!/usr/bin/env bash
# Writes apps/web/.env.local from the running local Supabase stack.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(supabase status -o env)"
cat > apps/web/.env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY:-$ANON_KEY}
SUPABASE_SECRET_KEY=${SECRET_KEY:-$SERVICE_ROLE_KEY}
SITE_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false
EOF
echo "wrote apps/web/.env.local"
