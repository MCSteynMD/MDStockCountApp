# Starting the Stock Control App

## Quick Start

### Windows
Double-click `start.bat` or run it from the command line:
```cmd
start.bat
```

### Linux/Mac
Make the script executable (first time only):
```bash
chmod +x start.sh
```

Then run it:
```bash
./start.sh
```

## What the Script Does

1. **Checks for Node.js** - Verifies Node.js is installed
2. **Checks for npm** - Verifies npm package manager is available
3. **Installs root dependencies** - Automatically installs if `node_modules` is missing
4. **Installs frontend dependencies** - Automatically installs if `frontend/node_modules` is missing
5. **Starts the application** - Launches both backend (port 3000) and frontend (port 5173)

## Access the Application

Once started, the application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000

## Manual Start (if needed)

If you prefer to start manually:

```bash
# Install dependencies (if not already installed)
npm install
cd frontend
npm install
cd ..

# Start the application
npm start
```

## Troubleshooting

- **"Node.js is not installed"**: Download and install from https://nodejs.org/
- **Port already in use**: Stop any process using ports 3000 or 5173
- **Dependencies fail to install**: Check your internet connection and try again

