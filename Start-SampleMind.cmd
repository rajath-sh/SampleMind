@echo off
setlocal
cd /d "%~dp0"
if not exist ".runtime\tmp" mkdir ".runtime\tmp"
set "TEMP=%CD%\.runtime\tmp"
set "TMP=%TEMP%"
set "PYTHONUTF8=1"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
set "npm_config_update_notifier=false"

if not exist ".venv\Scripts\python.exe" (
    if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
        "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m venv .venv
    ) else (
        py -3.12 -m venv .venv
    )
    if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -c "import fastapi, uvicorn, sqlalchemy, passlib, bcrypt, jose, tinydb, filelock, pandas, sklearn, joblib"
if errorlevel 1 (
    ".venv\Scripts\python.exe" -m pip install --no-cache-dir -r requirements.txt
    if errorlevel 1 goto failed
)

if not exist "frontend\node_modules\vite\bin\vite.js" (
    call npm.cmd ci --prefix frontend --cache "%CD%\.npm-cache" --no-audit --no-fund
    if errorlevel 1 goto failed
)
call npm.cmd run build --prefix frontend
if errorlevel 1 goto failed

".venv\Scripts\python.exe" database\init_db.py
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -c "import hashlib,json,pathlib; d=pathlib.Path('ml/artifacts'); m=json.loads((d/'model_manifest.json').read_text(encoding='utf-8')); assert m['artifact_sha256']==hashlib.sha256((d/'rf_sample_risk_model.joblib').read_bytes()).hexdigest()"
if errorlevel 1 (
    ".venv\Scripts\python.exe" ml\train_model.py
    if errorlevel 1 goto failed
)

echo.
echo SampleMind is starting. Open http://127.0.0.1:8000 in your browser.
echo Press Ctrl+C here to stop it.
".venv\Scripts\python.exe" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo SampleMind could not start. See the error above. Setup needs Python 3.12 and Node.js 20 or later.
pause
exit /b 1

