@echo off
rem 黄埔城更 demo 网关启动脚本（需 Node >= 18，零依赖）
cd /d %~dp0
node server.mjs
