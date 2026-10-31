#!/usr/bin/env bash
# ==============================================================================
# Scorva — Common Script Helpers & Environment Detection
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Styling (ANSI sequences evaluated via $'... ')
GREEN=$'\033[0;32m'
BLUE=$'\033[0;34m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
NC=$'\033[0m' # No Color

# Runtime paths
RUN_DIR="${PROJECT_ROOT}/.run"
PID_DIR="${RUN_DIR}/pids"
LOG_DIR="${RUN_DIR}/logs"

API_PID_FILE="${PID_DIR}/api.pid"
WEB_PID_FILE="${PID_DIR}/web.pid"
API_LOG_FILE="${LOG_DIR}/api.log"
WEB_LOG_FILE="${LOG_DIR}/web.log"

API_PORT=8000
WEB_PORT=3000
DB_PORT=5432
REDIS_PORT=6379
POSTGRES_SERVICE="postgresql@16"
REDIS_SERVICE="redis"

ensure_run_dirs() {
    mkdir -p "${PID_DIR}" "${LOG_DIR}"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_step() {
    echo -e "${CYAN}▶${NC} ${BOLD}$1${NC}"
}

log_success() {
    echo -e "${GREEN}✔${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}▲${NC} $1"
}

log_error() {
    echo -e "${RED}✖${NC} $1" >&2
}

# Portable port check
is_port_listening() {
    local port="$1"
    if [ -x "${PROJECT_ROOT}/.venv/bin/python" ]; then
        "${PROJECT_ROOT}/.venv/bin/python" -c "import socket; s = socket.socket(); s.settimeout(0.4); res = s.connect_ex(('127.0.0.1', int('$port'))); s.close(); exit(0 if res == 0 else 1)" 2>/dev/null
        return $?
    elif command -v nc >/dev/null 2>&1; then
        nc -z -w 1 127.0.0.1 "$port" >/dev/null 2>&1
        return $?
    else
        (echo > /dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
        return $?
    fi
}

# Find PID using a given listening port
get_pid_on_port() {
    local port="$1"
    if command -v fuser >/dev/null 2>&1; then
        fuser "$port/tcp" 2>&1 | tr -s ' ' '\n' | grep -E '^[0-9]+$' | head -n 1
    elif command -v ss >/dev/null 2>&1; then
        ss -lptn "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -n 1
    elif command -v lsof >/dev/null 2>&1; then
        lsof -t -i :"$port" -sTCP:LISTEN 2>/dev/null | head -n 1
    fi
}

# Check if a process ID is currently running
is_process_running() {
    local pid="$1"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# Read PID from a file if it exists and process is alive
get_running_pid() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && is_process_running "$pid"; then
            echo "$pid"
            return 0
        fi
    fi
    return 1
}

# Ensure .env is present
ensure_env_file() {
    if [ ! -f "${PROJECT_ROOT}/.env" ]; then
        if [ -f "${PROJECT_ROOT}/.env.example" ]; then
            log_warn "No .env file found. Creating from .env.example..."
            cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env"
            log_success "Created ${PROJECT_ROOT}/.env template"
        else
            log_error "Neither .env nor .env.example found in ${PROJECT_ROOT}"
            return 1
        fi
    fi
    return 0
}

add_homebrew_service_bins() {
    if ! command -v brew >/dev/null 2>&1; then
        return 0
    fi

    local formula prefix
    for formula in "$POSTGRES_SERVICE" "$REDIS_SERVICE"; do
        if brew list --versions "$formula" >/dev/null 2>&1; then
            prefix="$(brew --prefix "$formula")"
            PATH="${prefix}/bin:${PATH}"
        fi
    done
    export PATH
}

# Check dependencies needed for the selected startup mode
check_prerequisites() {
    local mode="${1:-host}"
    local start_api="${2:-1}"
    local start_web="${3:-1}"
    local missing=0

    if [ "$mode" = "docker" ]; then
        if ! command -v docker >/dev/null 2>&1; then
            log_error "Docker is required for --docker mode but is not installed or not in PATH."
            missing=1
        elif ! docker info >/dev/null 2>&1; then
            log_error "Docker is installed but the Docker daemon is not running."
            missing=1
        fi
    fi

    if [ "$start_web" -eq 1 ]; then
        if ! command -v node >/dev/null 2>&1; then
            log_error "Node.js is not installed or not in PATH."
            missing=1
        fi

        if ! command -v npm >/dev/null 2>&1; then
            log_error "npm is not installed or not in PATH."
            missing=1
        fi

        if [ ! -d "${PROJECT_ROOT}/apps/web/node_modules" ]; then
            log_error "Frontend dependencies are missing at apps/web/node_modules."
            log_info "Run: npm ci --prefix apps/web"
            missing=1
        fi
    fi

    if [ "$start_api" -eq 1 ]; then
        if ! command -v python3 >/dev/null 2>&1 && [ ! -x "${PROJECT_ROOT}/.venv/bin/python" ]; then
            log_error "Python 3.11+ is required but was not found."
            missing=1
        fi
        if [ ! -x "${PROJECT_ROOT}/.venv/bin/python" ]; then
            log_error "Python virtual environment (.venv) is missing."
            log_info "Run: ./scripts/setup.sh"
            missing=1
        fi
    fi

    return $missing
}

start_local_dependencies() {
    local service port
    add_homebrew_service_bins

    for service in "$POSTGRES_SERVICE" "$REDIS_SERVICE"; do
        if [ "$service" = "$POSTGRES_SERVICE" ]; then
            port="$DB_PORT"
        else
            port="$REDIS_PORT"
        fi

        if is_port_listening "$port"; then
            continue
        fi

        if ! command -v brew >/dev/null 2>&1 || ! brew list --versions "$service" >/dev/null 2>&1; then
            log_error "${service} is not installed or not listening on port ${port}."
            log_info "Run: ./scripts/setup.sh"
            return 1
        fi

        log_step "Starting local ${service} service..."
        brew services start "$service"

        local timeout=30
        while [ "$timeout" -gt 0 ] && ! is_port_listening "$port"; do
            sleep 1
            timeout=$((timeout - 1))
        done
        if ! is_port_listening "$port"; then
            log_error "${service} did not become ready on port ${port}."
            return 1
        fi
        log_success "${service} is listening on port ${port}."
    done
}
