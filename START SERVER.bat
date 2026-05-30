@echo off
echo Starting Set Apart Movement local server...
echo Open your browser to: http://localhost:3000
echo Press Ctrl+C to stop the server.
echo.
start "" "http://localhost:3000"
npx serve -p 3000
pause
