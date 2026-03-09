@echo off
echo ============================================================
echo   ATS PROJECT - PROFESSIONAL SETUP & INSTALLATION
echo ============================================================
echo.

:: 1. Backend Setup
echo [1/4] Setting up Python Virtual Environment...
cd backend
if not exist venv (
    python -m venv venv
    echo ✓ Virtual environment created.
) else (
    echo ✓ Virtual environment already exists.
)

echo [2/4] Installing Backend Dependencies (this may take a minute)...
call venv\Scripts\activate
pip install -r requirements.txt
echo ✓ Backend dependencies installed successfully.

echo [3/4] Downloading ML Models (SentenceTransformers, SpaCy)...
python download_models.py
echo ✓ ML models ready for use.
cd ..

:: 2. Frontend Setup
echo.
echo [4/4] Installing Frontend Dependencies...
cd frontend
if exist node_modules (
    echo ✓ node_modules already exists. Skipping npm install.
) else (
    call npm install
    echo ✓ Frontend dependencies installed successfully.
)
cd ..

echo.
echo ============================================================
echo   SETUP COMPLETE!
echo ============================================================
echo.
echo To start the system:
echo 1. Run backend: cd backend ^& venv\Scripts\python run_backend.py
echo 2. Run frontend: cd frontend ^& npm run dev
echo.
pause
