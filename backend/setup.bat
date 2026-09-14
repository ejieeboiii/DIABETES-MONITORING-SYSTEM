@echo off
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
  echo Creating virtual environment...
  py -3.13 -m venv venv 2>nul || python -m venv venv
)

call venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

echo.
echo Setup complete. Start the API with: start-server.bat
