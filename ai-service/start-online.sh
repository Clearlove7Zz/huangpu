#!/usr/bin/env bash
# 启动本机 AI + Cloudflare 公网隧道，并更新前端配置后可选发布
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$(cd "$ROOT/.." && pwd)"
CF="$ROOT/cloudflared"
CONFIG_JS="$PROJECT/js/safety-ai-config.js"
PORT="${PORT:-8765}"
LOCAL="http://127.0.0.1:${PORT}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

if [[ ! -x "$CF" ]]; then
  red "缺少 cloudflared：$CF"
  yellow "请先下载: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
  exit 1
fi

# 确保本地 API 在跑
if ! curl -sf --connect-timeout 2 "$LOCAL/api/health" >/dev/null; then
  yellow "本地 API 未就绪，正在后台启动 uvicorn ..."
  # shellcheck disable=SC1091
  source "$ROOT/.venv/bin/activate"
  export MPLCONFIGDIR="${MPLCONFIGDIR:-/tmp/matplotlib}"
  nohup uvicorn app:app --host 127.0.0.1 --port "$PORT" >"$ROOT/data/uvicorn.log" 2>&1 &
  for i in $(seq 1 60); do
    if curl -sf --connect-timeout 1 "$LOCAL/api/health" >/dev/null; then
      break
    fi
    sleep 1
  done
  curl -sf "$LOCAL/api/health" >/dev/null || { red "uvicorn 启动失败，见 $ROOT/data/uvicorn.log"; exit 1; }
  green "uvicorn 已启动"
fi

LOG=$(mktemp)
yellow "正在创建 Cloudflare 公网隧道 ..."
"$CF" tunnel --url "$LOCAL" --no-autoupdate >"$LOG" 2>&1 &
CF_PID=$!

PUBLIC=""
for i in $(seq 1 40); do
  PUBLIC=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  if [[ -n "$PUBLIC" ]]; then
    break
  fi
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    red "隧道进程退出："
    cat "$LOG"
    exit 1
  fi
  sleep 0.5
done

if [[ -z "$PUBLIC" ]]; then
  red "未能解析隧道地址"
  cat "$LOG"
  kill "$CF_PID" 2>/dev/null || true
  exit 1
fi

cat > "$CONFIG_JS" <<EOF
// AI 巡检 API 地址（由 ai-service/start-online.sh 自动更新公网隧道）
// 本地开发走 127.0.0.1；线上域名走 Cloudflare Tunnel
(function () {
  var local = '${LOCAL}';
  var publicApi = '${PUBLIC}';
  var host = location.hostname || '';
  if (host === '127.0.0.1' || host === 'localhost') {
    window.SAFETY_AI_API = local;
  } else {
    window.SAFETY_AI_API = publicApi;
  }
})();
EOF

green "公网 API: $PUBLIC"
green "已写入 $CONFIG_JS"

if [[ "${1:-}" == "--deploy" ]]; then
  yellow "正在发布静态站到 OSS ..."
  "$PROJECT/deploy/deploy-oss.sh"
fi

echo
green "线上测试：打开 http://huangpu-szsp.xyz/index.html → 安全日志 AI巡检"
yellow "注意：保持本终端运行；Ctrl+C 会断开公网隧道（URL 每次重启会变，需重新 --deploy）"
echo
tail -f "$LOG" &
TAIL_PID=$!
trap 'kill $CF_PID $TAIL_PID 2>/dev/null || true; rm -f "$LOG"' EXIT
wait "$CF_PID"
