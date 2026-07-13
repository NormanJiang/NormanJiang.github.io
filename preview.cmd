@echo off
setlocal
cd /d "%~dp0"
set "ASTRO_TELEMETRY_DISABLED=1"
node ".\node_modules\astro\bin\astro.mjs" preview --host 127.0.0.1
