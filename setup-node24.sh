#!/usr/bin/env bash
# setup-node24.sh
# Instala o Node 24 LTS localmente (sem sudo, sem mexer no Node do sistema)
# e, opcionalmente, prepara o projeto GameLog.
#
# Uso:
#   ./setup-node24.sh                 # só instala o Node 24
#   ./setup-node24.sh --project       # instala + npm install + prisma + sobe o banco
#   ./setup-node24.sh --project --dev # tudo acima + npm run dev
#   NODE_VERSION=24.21.0 ./setup-node24.sh   # fixa outra versão
#
# Rode a partir da raiz do projeto se usar --project.

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-24.21.0}"
INSTALL_ROOT="${HOME}/.local/node"
INSTALL_DIR="${INSTALL_ROOT}/v${NODE_VERSION}"
BIN_DIR="${INSTALL_DIR}/bin"

DO_PROJECT=false
DO_DEV=false
for arg in "$@"; do
  case "$arg" in
    --project) DO_PROJECT=true ;;
    --dev)     DO_PROJECT=true; DO_DEV=true ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Argumento desconhecido: $arg"; exit 1 ;;
  esac
done

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || fail "curl não encontrado."
command -v tar  >/dev/null || fail "tar não encontrado."

# --- 1. Detectar sistema/arquitetura -------------------------------------
case "$(uname -s)" in
  Linux)  OS="linux" ;;
  Darwin) OS="darwin" ;;
  *) fail "Sistema não suportado: $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64|amd64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) fail "Arquitetura não suportada: $(uname -m)" ;;
esac

# --- 2. Baixar e instalar ------------------------------------------------
if [ -x "${BIN_DIR}/node" ]; then
  ok "Node v${NODE_VERSION} já instalado em ${INSTALL_DIR}"
else
  FILE="node-v${NODE_VERSION}-${OS}-${ARCH}.tar.xz"
  BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  log "Baixando ${FILE}..."
  curl -fsSL "${BASE_URL}/${FILE}" -o "${TMP}/${FILE}" \
    || fail "Falha no download. Confira se a versão ${NODE_VERSION} existe em ${BASE_URL}/"

  log "Verificando checksum..."
  curl -fsSL "${BASE_URL}/SHASUMS256.txt" -o "${TMP}/SHASUMS256.txt"
  EXPECTED="$(grep " ${FILE}\$" "${TMP}/SHASUMS256.txt" | awk '{print $1}')"
  if command -v sha256sum >/dev/null; then
    ACTUAL="$(sha256sum "${TMP}/${FILE}" | awk '{print $1}')"
  else
    ACTUAL="$(shasum -a 256 "${TMP}/${FILE}" | awk '{print $1}')"
  fi
  [ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || fail "Checksum não confere."

  log "Extraindo em ${INSTALL_DIR}..."
  mkdir -p "${INSTALL_DIR}"
  tar -xJf "${TMP}/${FILE}" -C "${INSTALL_DIR}" --strip-components=1
  ok "Node v${NODE_VERSION} instalado."
fi

# --- 3. Link "current" + PATH persistente --------------------------------
ln -sfn "${INSTALL_DIR}" "${INSTALL_ROOT}/current"

PATH_LINE='export PATH="$HOME/.local/node/current/bin:$PATH"  # node 24 local'
for rc in "${HOME}/.bashrc" "${HOME}/.zshrc"; do
  if [ -f "$rc" ] && ! grep -qF '.local/node/current/bin' "$rc"; then
    printf '\n%s\n' "$PATH_LINE" >> "$rc"
    log "PATH adicionado em $rc"
  fi
done

# Vale para este script e para o restante da execução
export PATH="${BIN_DIR}:${PATH}"

log "node: $(node -v) | npm: $(npm -v)"
case "$(node -v)" in
  v24.*) ok "Node 24 ativo." ;;
  *) fail "O node ativo não é o v24 (é $(node -v))." ;;
esac

# --- 4. Fixar versão no projeto (útil p/ nvm/fnm/IDE) ---------------------
if [ -f package.json ] || [ -d src ]; then
  [ -f .nvmrc ] || { echo "24" > .nvmrc; log ".nvmrc criado (24)."; }
fi

# --- 5. Preparar o projeto (opcional) -------------------------------------
if $DO_PROJECT; then
  [ -f package.json ] || fail "package.json não encontrado. Rode na raiz do projeto."

  if command -v docker >/dev/null && [ -n "$(ls docker-compose*.y*ml compose*.y*ml 2>/dev/null)" ]; then
    log "Subindo o banco (docker compose)..."
    docker compose up -d db 2>/dev/null || docker compose up -d || log "Não consegui subir o banco; siga em frente se ele já estiver rodando."
  fi

  log "Instalando dependências..."
  npm install

  if [ -f src/backend/prisma/schema.prisma ]; then
    log "Aplicando migrations e seed do Prisma..."
    (cd src/backend && npx prisma generate && npx prisma migrate deploy && (npx prisma db seed || true))
  fi

  ok "Projeto pronto."

  if $DO_DEV; then
    log "Iniciando npm run dev (Ctrl+C para parar)..."
    exec npm run dev
  fi
fi

echo
ok "Pronto! Abra um novo terminal (ou rode: source ~/.bashrc) para usar o Node 24."
echo "   Subir manualmente depois:  cd <projeto> && npm run dev"
