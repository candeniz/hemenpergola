@echo off
chcp 65001 >nul
setlocal
title Hemen Pergola - durdur
cd /d "%~dp0"

echo.
echo   HEMEN PERGOLA - DURDUR
echo   ---------------------------------------------
echo.
echo   Postgres ve MinIO durduruluyor...
docker compose down
echo.
echo   Durduruldu. Veriler korundu.
echo   (Acik kalan web / worker / mobil pencerelerini de kapat.)
echo.
timeout /t 8 >nul
exit /b 0
