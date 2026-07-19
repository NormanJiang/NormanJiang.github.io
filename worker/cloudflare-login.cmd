@echo off
setlocal
pushd "%~dp0"
node ".\node_modules\wrangler\bin\wrangler.js" login
set EXIT_CODE=%ERRORLEVEL%
popd
exit /b %EXIT_CODE%
