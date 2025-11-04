@echo off
echo ========================================
echo   Stock Control App - Startup Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Checking Node.js version...
node --version
echo.

REM Check if npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm is not installed or not in PATH
    pause
    exit /b 1
)

echo [2/4] Checking root directory dependencies...
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install root dependencies
        pause
        exit /b 1
    )
    echo Root dependencies installed successfully.
) else (
    echo Root dependencies already installed.
)
echo.

echo [3/4] Checking frontend dependencies...
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install frontend dependencies
        pause
        exit /b 1
    )
    cd ..
    echo Frontend dependencies installed successfully.
) else (
    echo Frontend dependencies already installed.
)
echo.

echo [4/4] Starting the application...
echo.
echo ========================================
echo   Application starting...
echo   Backend: http://localhost:3000
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Press Ctrl+C to stop the application
echo.

call npm start

pause

