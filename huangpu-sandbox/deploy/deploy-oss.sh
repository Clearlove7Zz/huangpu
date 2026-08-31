#!/usr/bin/env bash
# 黄埔区城更数字沙盘 — 阿里云 OSS 静态部署
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/oss.env"
OSSUTIL_VERSION="2.3.0"
if [[ "$(uname -m)" == "arm64" ]]; then
  OSSUTIL_DIR="$SCRIPT_DIR/ossutil-${OSSUTIL_VERSION}-mac-arm64"
else
  OSSUTIL_DIR="$SCRIPT_DIR/ossutil-${OSSUTIL_VERSION}-mac-amd64"
fi
OSSUTIL="$OSSUTIL_DIR/ossutil"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

usage() {
  cat <<'EOF'
用法: ./deploy/deploy-oss.sh [--dry-run]

环境: 复制 deploy/oss.env.example 为 deploy/oss.env 并填写密钥。

首次部署前请在 OSS 控制台完成:
  1. 创建 Bucket
  2. 开启静态页面托管，默认首页 index.html
  3. Bucket 设为公共读，或绑定 CDN + 回源鉴权

EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

if [[ ! -f "$ENV_FILE" ]]; then
  red "未找到 $ENV_FILE"
  yellow "请先执行: cp deploy/oss.env.example deploy/oss.env"
  yellow "然后编辑 deploy/oss.env 填入 Bucket 与 AccessKey"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

for var in OSS_ENDPOINT OSS_BUCKET OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    red "缺少配置: $var（请检查 deploy/oss.env）"
    exit 1
  fi
done

if [[ "$OSS_BUCKET" == "your-bucket-name" ]]; then
  red "请先在 deploy/oss.env 中填写真实的 OSS_BUCKET"
  exit 1
fi

ensure_ossutil() {
  if [[ -x "$OSSUTIL" ]]; then
    return
  fi
  if command -v ossutil >/dev/null 2>&1; then
    OSSUTIL="$(command -v ossutil)"
    return
  fi
  local arch zip url
  arch="$(uname -m)"
  if [[ "$arch" == "arm64" ]]; then
    zip="ossutil-${OSSUTIL_VERSION}-mac-arm64.zip"
  else
    zip="ossutil-${OSSUTIL_VERSION}-mac-amd64.zip"
  fi
  url="https://gosspublic.alicdn.com/ossutil/v2/${OSSUTIL_VERSION}/${zip}"
  yellow "未检测到 ossutil，正在下载 ${zip} ..."
  curl -fsSL "$url" -o "$SCRIPT_DIR/$zip"
  unzip -o "$SCRIPT_DIR/$zip" -d "$SCRIPT_DIR"
  chmod +x "$OSSUTIL"
  rm -f "$SCRIPT_DIR/$zip"
  green "ossutil ${OSSUTIL_VERSION} 已就绪"
}

ensure_ossutil

OSS_TARGET="oss://${OSS_BUCKET}"
if [[ -n "${OSS_PREFIX:-}" ]]; then
  OSS_PREFIX="${OSS_PREFIX#/}"
  OSS_PREFIX="${OSS_PREFIX%/}"
  OSS_TARGET="${OSS_TARGET}/${OSS_PREFIX}"
fi

OSS_REGION="${OSS_REGION:-${OSS_ENDPOINT#oss-}}"
OSS_REGION="${OSS_REGION%.aliyuncs.com}"

OSSUTIL_CONFIG="$SCRIPT_DIR/.ossutilconfig"
cat > "$OSSUTIL_CONFIG" <<EOF
[default]
accessKeyID=${OSS_ACCESS_KEY_ID}
accessKeySecret=${OSS_ACCESS_KEY_SECRET}
region=${OSS_REGION}
EOF
chmod 600 "$OSSUTIL_CONFIG"

SYNC_ARGS=(
  sync "$PROJECT_DIR/" "$OSS_TARGET/"
  --config-file "$OSSUTIL_CONFIG"
  -f
  --exclude ".DS_Store"
  --exclude "deploy/**"
  --exclude "docs/**"
  --exclude "ai-service/**"
  --exclude "**/*.md"
  --exclude "**/.git/**"
  --exclude "**/.venv/**"
)

if $DRY_RUN; then
  yellow "【预览模式】以下文件将被上传（不会实际上传）:"
  SYNC_ARGS+=(--dryrun)
fi

green "开始同步: $PROJECT_DIR/ → $OSS_TARGET/"
"$OSSUTIL" "${SYNC_ARGS[@]}"

if $DRY_RUN; then
  exit 0
fi

echo
green "部署完成。"
echo
if [[ "${OSS_REGION:-${OSS_ENDPOINT#oss-}}" == cn-hongkong* ]] || [[ "$OSS_ENDPOINT" == *hongkong* ]]; then
  yellow "香港 Bucket 无需 ICP，但仍需绑定自定义域名才能正常浏览 HTML。"
else
  yellow "中国内地 Bucket 需绑定已备案的自定义域名才能正常浏览网页。"
fi
yellow "OSS 默认域名会强制下载 HTML；oss-website 域名对新 Bucket 通常不可用。"
yellow "若需立即访问，可运行: ./deploy/deploy-gitee.sh"
echo
if [[ -n "${OSS_WEBSITE_URL:-}" && "$OSS_WEBSITE_URL" != *"your-bucket"* ]]; then
  green "自定义域名（配置 OSS_WEBSITE_URL 后）: ${OSS_WEBSITE_URL%/}/"
elif [[ -n "${OSS_CUSTOM_DOMAIN:-}" ]]; then
  green "自定义域名: ${OSS_CUSTOM_DOMAIN%/}/"
else
  echo "  控制台: Bucket → 传输管理 → 域名管理 → 绑定域名"
  echo "  绑定后在 deploy/oss.env 设置 OSS_WEBSITE_URL=http://你的域名"
fi
