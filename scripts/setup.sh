#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

SKIP_FRONTEND=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-frontend)
            SKIP_FRONTEND=1
            shift
            ;;
        -h|--help)
            echo "Usage: ./scripts/setup.sh [--skip-frontend]"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

cd "${PROJECT_ROOT}"
ensure_env_file

if ! command -v brew >/dev/null 2>&1; then
    log_error "Homebrew is required to install PostgreSQL and Redis."
    log_info "Install Homebrew from https://brew.sh, then rerun ./scripts/setup.sh."
    exit 1
fi

for formula in "$POSTGRES_SERVICE" "$REDIS_SERVICE"; do
    if ! brew list --versions "$formula" >/dev/null 2>&1; then
        log_step "Installing ${formula} with Homebrew..."
        brew install "$formula"
    fi
done

add_homebrew_service_bins
log_step "Starting local PostgreSQL and Redis services..."
brew services start "$POSTGRES_SERVICE"
brew services start "$REDIS_SERVICE"

for port in "$DB_PORT" "$REDIS_PORT"; do
    timeout=30
    while [ "$timeout" -gt 0 ] && ! is_port_listening "$port"; do
        sleep 1
        timeout=$((timeout - 1))
    done
    if ! is_port_listening "$port"; then
        log_error "A local dependency did not become ready on port ${port}."
        exit 1
    fi
done

if ! command -v python3 >/dev/null 2>&1; then
    log_error "Python 3.11+ is required for the API."
    exit 1
fi
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
    log_error "Python 3.11+ is required for the API."
    exit 1
fi

if [ ! -x "${PROJECT_ROOT}/.venv/bin/python" ]; then
    log_step "Creating the API Python virtual environment..."
    python3 -m venv .venv
fi

log_step "Installing API Python dependencies..."
"${PROJECT_ROOT}/.venv/bin/python" -m pip install --upgrade pip
"${PROJECT_ROOT}/.venv/bin/python" -m pip install -r apps/api/requirements.txt

set -a
source "${PROJECT_ROOT}/.env"
set +a
POSTGRES_USER="${POSTGRES_USER:-scorva}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-scorva_dev_password}"
POSTGRES_DB="${POSTGRES_DB:-scorva}"
export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB

log_step "Creating local PostgreSQL role and database if needed..."
psql -d postgres -v ON_ERROR_STOP=1 \
    <<'SQL'
\getenv scorva_user POSTGRES_USER
\getenv scorva_password POSTGRES_PASSWORD
\getenv scorva_db POSTGRES_DB
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'scorva_user', :'scorva_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'scorva_user')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'scorva_user', :'scorva_password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'scorva_db', :'scorva_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'scorva_db')
\gexec
SQL

if [ "$SKIP_FRONTEND" -eq 0 ]; then
    log_step "Installing frontend dependencies..."
    npm ci --prefix apps/web
else
    log_warn "Skipped frontend packages. Install them later with: npm ci --prefix apps/web"
fi

log_success "Local infrastructure and API dependencies are installed and configured."
log_info "Start Scorva with ./start.sh"
