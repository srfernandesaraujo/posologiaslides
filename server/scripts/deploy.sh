#!/usr/bin/env bash
# Disparado pelo webhook do GitHub (ver server/routes/deployWebhookRoutes.js)
# a cada push na branch de deploy, ou rodado manualmente. NÃO usa `set -e`
# de propósito: uma falha no meio precisa ser tratada (rollback), não matar o
# script na hora — cada etapa cuida do próprio erro explicitamente.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR" || exit 1

# Carrega server/.env pra pegar PM2_PROCESS_NAME/DEPLOY_BRANCH/HEALTH_URL/PORT
# — não dá pra confiar em variável de ambiente HERDADA de quem chamou este
# script: `systemd-run` (ver deployWebhookRoutes.js) NÃO repassa o ambiente
# do processo que o invoca pro processo que ele cria, diferente de um spawn
# direto. Sem isto, PM2_PROCESS_NAME caía no valor padrão do script (errado)
# e o pm2 restart falhava silenciosamente — bug real visto em produção
# (2026-08-14): o healthcheck passava mesmo assim, só porque o processo
# ANTIGO continuava no ar sem reiniciar de verdade.
ENV_FILE="$REPO_DIR/server/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

LOCK_FILE="/tmp/posologia-deploy.lock"
STATE_FILE="$REPO_DIR/server/.deploy-last-good"
LOG_DIR="$REPO_DIR/server/logs"
LOG_FILE="$LOG_DIR/deploy.log"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-posologia-backend}"
HEALTH_URL="${HEALTH_URL:-http://localhost:${PORT:-3001}/api/health}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

mkdir -p "$LOG_DIR"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

# Evita dois deploys simultâneos (ex.: dois pushes seguidos disparando o
# webhook quase ao mesmo tempo) pisando um no outro no meio de um git reset.
if [ -e "$LOCK_FILE" ]; then
  log "Deploy já em andamento (lock file presente) — abortando esta execução."
  exit 0
fi
touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

CURRENT_COMMIT="$(git rev-parse HEAD)"
# Primeira execução: sem estado salvo ainda, o "último bom conhecido" é o
# commit que já está rodando agora.
LAST_GOOD="$(cat "$STATE_FILE" 2>/dev/null || echo "$CURRENT_COMMIT")"

log "=== Deploy iniciado. atual=$CURRENT_COMMIT último-bom=$LAST_GOOD ==="

git fetch origin "$DEPLOY_BRANCH" >> "$LOG_FILE" 2>&1
git reset --hard "origin/$DEPLOY_BRANCH" >> "$LOG_FILE" 2>&1
NEW_COMMIT="$(git rev-parse HEAD)"

if [ "$NEW_COMMIT" = "$CURRENT_COMMIT" ]; then
  log "Nenhum commit novo em origin/$DEPLOY_BRANCH — nada a fazer."
  exit 0
fi

rollback() {
  local reason="$1"
  log "$reason — revertendo para $LAST_GOOD."
  git reset --hard "$LAST_GOOD" >> "$LOG_FILE" 2>&1
  (cd server && npm install >> "$LOG_FILE" 2>&1)
  pm2 restart "$PM2_PROCESS_NAME" >> "$LOG_FILE" 2>&1
  log "Rollback concluído para $LAST_GOOD."
}

log "Atualizado para $NEW_COMMIT. Instalando dependências do servidor..."
if ! (cd server && npm install >> "$LOG_FILE" 2>&1); then
  rollback "npm install falhou em $NEW_COMMIT"
  exit 1
fi

log "Reiniciando pm2 ($PM2_PROCESS_NAME)..."
if ! pm2 restart "$PM2_PROCESS_NAME" >> "$LOG_FILE" 2>&1; then
  # Antes disto, uma falha aqui (ex.: nome de processo errado) era ignorada
  # e o script seguia pro healthcheck mesmo assim — que passava de qualquer
  # jeito porque o processo ANTIGO continuava no ar, sem reiniciar de
  # verdade, e o deploy era marcado como sucesso sem o código novo estar
  # rodando (bug real visto em produção, 2026-08-14).
  rollback "pm2 restart falhou em $NEW_COMMIT (processo '$PM2_PROCESS_NAME' não encontrado? confira PM2_PROCESS_NAME no .env)"
  exit 1
fi

log "Aguardando o servidor responder em $HEALTH_URL..."
sleep 5
HEALTHY=0
for i in 1 2 3 4 5; do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 3
done

if [ "$HEALTHY" -eq 1 ]; then
  log "Healthcheck OK. Deploy concluído em $NEW_COMMIT."
  echo "$NEW_COMMIT" > "$STATE_FILE"
else
  rollback "Healthcheck falhou depois do deploy em $NEW_COMMIT"
  exit 1
fi
