@echo off
chcp 65001 >nul
setlocal
title Hemen Pergola - mobil
cd /d "%~dp0"

echo.
echo   HEMEN PERGOLA - MOBIL
echo   ---------------------------------------------
echo.

if not exist "node_modules" (
  echo   Paketler kurulu degil.
  echo   Once "Hemen Pergola - ilk kurulum.cmd" dosyasini calistir.
  pause & exit /b 1
)

echo   Web sunucusu acik olmali - "Hemen Pergola.cmd" calisiyor mu?
echo   Telefonuna Expo Go kur ve ayni Wi-Fi agina bagli oldugundan emin ol.
echo.
echo   Expo baslatiliyor. QR kodu Expo Go ile okut.
echo.

call pnpm --filter mobile start
pause
exit /b 0
