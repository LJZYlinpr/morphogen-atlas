@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 serve.py --open --port 0
) else (
  python serve.py --open --port 0
)
pause
