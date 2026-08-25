@echo off
chcp 65001 >nul
setlocal
title Hemen Pergola - ilk kurulum
cd /d "%~dp0"

echo.
echo   HEMEN PERGOLA - ILK KURULUM
echo   ---------------------------------------------
echo   Bu dosyayi yalnizca bir kez calistir.
echo   Klasor: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js bulunamadi. https://nodejs.org adresinden kur.
  echo   Gereken surum .nvmrc dosyasinda yazili.
  pause & exit /b 1
)
where docker >nul 2>&1
if errorlevel 1 (
  echo   Docker Desktop bulunamadi. https://docker.com adresinden kur.
  pause & exit /b 1
)

echo   [0/4] pnpm hazirlaniyor...
call corepack enable >nul 2>&1
call corepack prepare --activate >nul 2>&1
where pnpm >nul 2>&1
if errorlevel 1 (
  call npm install -g pnpm
  if errorlevel 1 (echo   pnpm kurulamadi. & pause & exit /b 1)
)

if not exist ".env" (
  echo   [.env] olusturuluyor...
  copy ".env.example" ".env" >nul
)

echo   [1/4] Paketler kuruluyor... (birkac dakika surebilir)
call pnpm install
if errorlevel 1 (echo. & echo   Paket kurulumu basarisiz. & pause & exit /b 1)

echo   [2/4] Postgres ve MinIO baslatiliyor...
docker compose up -d
if errorlevel 1 (echo. & echo   Docker yanit vermedi. Docker Desktop acik mi? & pause & exit /b 1)
echo   Veritabani hazirlaniyor, 10 saniye bekleniyor...
timeout /t 10 /nobreak >nul

echo   [3/4] Veritabani semasi kuruluyor...
call pnpm prisma migrate deploy
if errorlevel 1 (echo. & echo   Migration basarisiz. & pause & exit /b 1)

echo   [4/4] Demo verisi yukleniyor...
call pnpm seed demo
if errorlevel 1 (echo. & echo   Demo verisi yuklenemedi. & pause & exit /b 1)

echo.
echo   ---------------------------------------------
echo   Kurulum tamam. Simdi "Hemen Pergola.cmd" ile ac.
echo.
pause
exit /b 0
