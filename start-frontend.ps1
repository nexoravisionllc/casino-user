# Starts the React (Vite) dev server on http://localhost:5173
# Uses the portable Node.js that was placed under D:\work\tools.
$node = "D:\work\tools\node-v26.5.0-win-x64"
if (Test-Path $node) { $env:Path = "$node;" + $env:Path }
Set-Location "$PSScriptRoot\user-frontend"
npm run dev
