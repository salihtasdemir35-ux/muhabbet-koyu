@echo off
chcp 65001 >nul
title Muhabbet Koyu - Baslatici
cd /d "%~dp0"
echo.
echo  ==============================================
echo     MUHABBET KOYU - Balik bahane, muhabbet sahane!
echo  ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js yuklu degil. Acilan sayfadan "LTS" surumunu kurun,
  echo      sonra bu dosyaya tekrar cift tiklayin.
  start https://nodejs.org/tr
  pause
  exit /b
)
if not exist node_modules (
  echo  [1/4] Paketler yukleniyor ^(ilk seferde 1-3 dakika^)...
  call npm install
)
echo  [2/4] Oyun hazirlaniyor...
call npm run build >nul
if not exist cloudflared.exe (
  echo  [3/4] Ucretsiz internet tuneli indiriliyor ^(Cloudflare, tek seferlik^)...
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
echo  [4/4] Sunucu ve tunel baslatiliyor...
start "Muhabbet Koyu SUNUCU (kapatmayin)" /min cmd /k npm start
timeout /t 4 >nul
if exist tunnel.log del tunnel.log
start "Muhabbet Koyu TUNEL (kapatmayin)" /min cloudflared.exe tunnel --url http://localhost:8080 --logfile tunnel.log
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u=''; for($i=0; $i -lt 90 -and -not $u; $i++){ Start-Sleep 1; if(Test-Path 'tunnel.log'){ $m = Select-String -Path 'tunnel.log' -Pattern 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if($m){ $u = $m.Matches[0].Value } } }; if($u){ Set-Clipboard $u; Write-Host ''; Write-Host '  OYUN ADRESI (panoya kopyalandi):' -ForegroundColor Green; Write-Host ('  ' + $u) -ForegroundColor Green; Write-Host ''; Write-Host '  APK icin sunucu adresi:' -ForegroundColor Yellow; Write-Host ('  ' + ($u -replace '^https','wss') + '/ws') -ForegroundColor Yellow; Write-Host ''; Write-Host '  Bu adresi WhatsApp ile arkadaslarina gonder.'; Start-Process $u } else { Write-Host '  Tunel adresi alinamadi. Internet baglantinizi kontrol edip tekrar deneyin.' -ForegroundColor Red }"
echo.
echo  Oyun acik kaldigi surece bu pencereyi ve kucultulmus 2 pencereyi KAPATMAYIN.
echo  Kapatmak icin: tum Muhabbet Koyu pencerelerini kapatin.
echo.
pause
