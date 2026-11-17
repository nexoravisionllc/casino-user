# Starts the User Node.js backend on http://localhost:5090
# Connects to the "Solution" MySQL database (see user-backend\.env).
$node = "D:\work\tools\node-v26.5.0-win-x64"
if (Test-Path $node) { $env:Path = "$node;" + $env:Path }
Set-Location "$PSScriptRoot\user-backend"
if (-not (Test-Path node_modules)) { npm install }
npm start
