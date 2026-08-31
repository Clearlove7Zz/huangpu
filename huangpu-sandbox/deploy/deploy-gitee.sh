#!/usr/bin/env bash
# 黄埔沙盘 — Gitee Pages 部署（无需备案，浏览器可直接打开）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PROJECT_DIR/.." && pwd)"
BRANCH="${GITEE_PAGES_BRANCH:-gitee-pages-huangpu}"
REMOTE="${GITEE_REMOTE:-origin}"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

rsync -a \
  --exclude 'deploy/' \
  --exclude 'docs/' \
  --exclude '.DS_Store' \
  "$PROJECT_DIR/" "$WORK/"

cd "$WORK"
git init -q
git checkout -q -b "$BRANCH"
git add .
git commit -q -m "deploy: 黄埔沙盘静态站点 $(date +%Y-%m-%d)"

REMOTE_URL=$(git -C "$REPO_ROOT" remote get-url "$REMOTE")
git remote add origin "$REMOTE_URL"

yellow "推送到 $REMOTE/$BRANCH ..."
git push -f origin "$BRANCH"

echo
green "代码已推送到分支: $BRANCH"
echo
yellow "请在 Gitee 开启 Pages（只需做一次）:"
echo "  1. 打开 https://gitee.com/zhongxiaohao666/practice/settings/pages"
echo "  2. 部署分支选: $BRANCH"
echo "  3. 部署目录选: / （根目录）"
echo "  4. 点击启动 / 更新"
echo
green "Pages 地址通常为:"
echo "  https://zhongxiaohao666.gitee.io/practice/"
