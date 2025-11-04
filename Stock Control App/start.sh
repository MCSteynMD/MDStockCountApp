#!/bin/bash

echo "========================================"
echo "  Stock Control App - Startup Script"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[1/4] Checking Node.js version..."
node --version
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed or not in PATH"
    exit 1
fi

echo "[2/4] Checking root directory dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install root dependencies"
        exit 1
    fi
    echo "Root dependencies installed successfully."
else
    echo "Root dependencies already installed."
fi
echo ""

echo "[3/4] Checking frontend dependencies..."
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install frontend dependencies"
        exit 1
    fi
    cd ..
    echo "Frontend dependencies installed successfully."
else
    echo "Frontend dependencies already installed."
fi
echo ""

echo "[4/4] Starting the application..."
echo ""
echo "========================================"
echo "  Application starting..."
echo "  Backend: http://localhost:3000"
echo "  Frontend: http://localhost:5173"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop the application"
echo ""

npm start

