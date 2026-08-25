@echo off
chcp 65001 >nul
setlocal
title Hemen Pergola - yerel sunucu
cd /d "%~dp0"

echo.
echo   HEMEN PERGOLA
echo   ---------------------------------------------
echo.

if not exist "node_modules" (
  echo   Paketler kurulu degil.
  echo   Once "Hemen Pergola - ilk kurulum.cmd" dosyasini calistir.
  echo.
  pause
  exit /b 1
)

echo   [1/4] Postgres ve MinIO baslatiliyor...
docker compose up -d >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Docker yanit vermedi. Docker Desktop acik mi?
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo   [.env] bulunamadi, ornekten kopyalaniyor...
  copy ".env.example" ".env" >nul
)

echo   [2/4] Veritabani semasi guncelleniyor...
call pnpm prisma migrate deploy >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Migration basarisiz.
  echo   "Hemen Pergola - ilk kurulum.cmd" dosyasini calistir.
  echo.
  pause
  exit /b 1
)

echo   [3/4] Arka plan isleyici baslatiliyor...
start "Hemen Pergola - worker" /D "%CD%" cmd /k pnpm worker

echo   [4/4] Web sunucusu baslatiliyor...
start "Hemen Pergola - web" /D "%CD%" cmd /k pnpm dev

echo.
echo   Sunucu bekleniyor...
set /a tries=0
:wait
set /a tries+=1
if %tries% GTR 90 (
  echo.
  echo   Sunucu 3 dakikada acilmadi.
  echo   "Hemen Pergola - web" penceresindeki hataya bak.
  echo.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
curl -s -o nul http://127.0.0.1:3000 2>nul
if errorlevel 1 goto wait

start "" http://localhost:3000

echo.
echo   Hazir: http://localhost:3000
echo.
echo   Demo hesaplari:
echo     Musteri   musteri@pergola.local      / phase4-core-flow-customer-password
echo     Uretici   owner@egepergola.local     / phase3-pilot-manufacturer-password
echo     Admin     admin@pergola.local        / phase2-gate-admin-password
echo.
echo   Giden e-postalar:  http://localhost:3000/api/dev/mailbox
echo   MinIO konsolu:     http://localhost:9001  (pergola / pergola-secret)
echo.
echo   Mobil uygulama:  "Hemen Pergola - mobil.cmd"
echo   Durdurmak icin:  "Hemen Pergola - durdur.cmd"
echo.
timeout /t 20 >nul
exit /b 0
