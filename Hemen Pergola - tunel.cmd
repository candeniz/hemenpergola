@echo off
chcp 65001 >nul
setlocal
title Hemen Pergola - tunel (telefon testi)
cd /d "%~dp0"

echo.
echo   HEMEN PERGOLA - TUNEL
echo   ---------------------------------------------
echo   Telefondaki test APK'si icin: yerel sunucuyu
echo   gecici bir HTTPS adresinin arkasina alir ve
echo   web + worker'i o adresle baslatir.
echo.
echo   "Hemen Pergola.cmd" ile AYNI ANDA calistirma -
echo   bu dosya sunucuyu kendisi baslatiyor.
echo.

if not exist "node_modules" (
  echo   Paketler kurulu degil.
  echo   Once "Hemen Pergola - ilk kurulum.cmd" dosyasini calistir.
  pause & exit /b 1
)

node scripts/tunnel.mjs
pause
exit /b 0
