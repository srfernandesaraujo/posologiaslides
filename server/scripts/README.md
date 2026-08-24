# Backup e recuperação de desastre

Este documento cobre duas coisas separadas: o backup rotineiro dos dados de
cada conta (proteção contra "apaguei sem querer" ou bug do app), e o que
fazer se a própria máquina/disco do servidor morrer (proteção contra perda
total de hardware).

## 1. Backup automático diário (dados das contas)

`scheduledBackup.js` gera o mesmo `.zip` que o botão "Fazer backup agora" do
app (pastas + apresentações + mídia), de todas as contas de uma vez, direto
em disco — sem passar pelo navegador. Agendado via systemd timer (unit files
em `systemd/`).

**Instalar/ligar** (uma vez, nesta máquina):

```bash
mkdir -p ~/.config/systemd/user
cp scripts/systemd/posologia-backup.service ~/.config/systemd/user/
cp scripts/systemd/posologia-backup.timer ~/.config/systemd/user/
# edite WorkingDirectory em posologia-backup.service pro caminho real desta máquina
systemctl --user daemon-reload
systemctl --user enable --now posologia-backup.timer
```

**Onde ficam os arquivos**: `server/backups/<userId>/backup-<timestamp>.zip`
por padrão (ajustável via `BACKUP_DIR` no `.env`). Retenção padrão: 7 mais
recentes por conta (`BACKUP_RETENTION`).

**Importante**: por padrão esses `.zip` ficam só no disco local — não
protegem contra a máquina/disco morrer, só contra erro de dados. Para isso,
ver seção 3.

**Restaurar**: copie o `.zip` desejado pro seu computador (`scp
usuario@servidor:~/.../server/backups/<userId>/backup-XXXX.zip .`) e use o
botão "Restaurar de um arquivo .zip" em Configurações → Backup no app. Nunca
sobrescreve dados existentes — sempre cria cópias novas prefixadas
`[Restaurado dd/mm/aaaa HH:mm]`.

## 2. O que está em risco se a máquina morrer

Os **dados das contas** (apresentações, pastas, mídia) já vivem no Firestore
e no Cloud Storage do Firebase — serviços gerenciados pelo Google, com sua
própria redundância, **independentes desta máquina física**. Se o servidor de
casa morrer, os dados dos usuários não somem.

O que **só existe nesta máquina** e precisa de plano próprio:

- `server/.env` — credenciais (Firebase Admin, `DEPLOY_WEBHOOK_SECRET`,
  etc.). Não está no git (corretamente — são segredos em texto puro).
- Credenciais do Cloudflare Tunnel (`~/.cloudflared/`) — é o que faz
  `backend.posologia.app` chegar até o `pm2` rodando localmente. Sem isso,
  uma máquina nova não tem como assumir o mesmo endereço.
- Estado do `loginctl enable-linger` e dos timers/serviços do systemd —
  reconfiguração rápida, não é segredo, só trabalho manual.

## 3. Plano de recuperação — trocar de máquina/disco

**Fazer AGORA, uma vez, e repetir sempre que um segredo mudar** (isto é
manual de propósito — automatizar o envio de segredos pra fora do servidor
numa rotina agendada é mais risco de segurança do que vale a pena para algo
que muda raramente):

1. Copie `server/.env` e a pasta `~/.cloudflared/` pra um lugar seguro fora
   desta máquina — um gerenciador de senhas (1Password, Bitwarden) ou um
   `.zip` com senha guardado no seu próprio OneDrive/Drive pessoal.

**Ligar o backup automático dos DADOS também fora desta máquina** (evita
depender do passo manual acima ficar sempre atualizado, para esta parte
específica):

2. No `server/.env`, adicione `BACKUP_OFFSITE_UPLOAD=true`. A partir da
   próxima execução do timer, cada `.zip` gerado também sobe pro mesmo Cloud
   Storage que o app já usa (prefixo `_system-backups/`, credencial de
   serviço já existente — nenhum OAuth novo), com a mesma retenção. Sobrevive
   a esta máquina inteira sumindo.

**Checklist pra reconstruir numa máquina nova** (Ubuntu/Debian assumido,
ajuste se for outra distro):

```bash
# 1. Node.js + git + pm2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2

# 2. Clonar o repositório
git clone <url-do-repo> ~/posologia-slides
cd ~/posologia-slides/server

# 3. Restaurar server/.env a partir do backup seguro (passo 1 acima)
#    e instalar dependências
npm install

# 4. Restaurar o Cloudflare Tunnel a partir do backup de ~/.cloudflared/
#    (ou, se não tiver esse backup: criar um túnel novo no painel do
#    Cloudflare Zero Trust > Networks > Tunnels, e atualizar o DNS de
#    backend.posologia.app para apontar pra ele)
sudo apt-get install -y cloudflared
cloudflared service install <token-do-túnel>

# 5. Subir o backend com pm2 (config já versionada no repo)
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # segue as instruções impressas — faz o pm2 religar sozinho no boot

# 6. Religar os timers de backup (ver seção 1 deste arquivo)

# 7. Habilitar linger, necessário pro deploy automático via webhook e pro
#    timer de backup funcionarem sem ninguém logado
sudo loginctl enable-linger $USER

# 8. Restaurar os dados mais recentes, se o Firestore/Storage também tiver
#    sido afetado (cenário raro — normalmente não precisa, ver seção 2):
#    baixe o .zip mais recente de _system-backups/ no Cloud Storage e use o
#    botão "Restaurar" do app.
```

Depois disso, confira `curl -sf https://backend.posologia.app/api/health` e
teste um login no app.
