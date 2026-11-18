@echo off
title Muhabbet Koyu Sunucusu
echo Muhabbet Koyu hazirlaniyor (ilk calistirmada birkac dakika surer)...
call npm install
call npm run build
echo.
echo Tarayicida acin:  http://localhost:8080
echo Ayni Wi-Fi'deki arkadaslar: http://BU-BILGISAYARIN-IP-ADRESI:8080
start http://localhost:8080
call npm start
pause
