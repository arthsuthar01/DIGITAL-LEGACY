@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 goto use_py
where python >nul 2>nul
if not errorlevel 1 goto use_python
echo Python 3 was not found.
echo Install Python 3, or open this folder in VS Code and use the Live Server extension.
pause
goto end

:use_py
start "Digital Legacy Browser" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8765/index.html'"
py -m http.server 8765 --bind 127.0.0.1
goto end

:use_python
start "Digital Legacy Browser" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8765/index.html'"
python -m http.server 8765 --bind 127.0.0.1
goto end

:end
endlocal
