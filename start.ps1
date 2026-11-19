# YOLO 知识图谱一键启动（Windows）
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = if ($env:MIMO_PYTHON) { $env:MIMO_PYTHON } else { "python" }

Write-Host "==> 启动后端 (127.0.0.1:8000)" -ForegroundColor Cyan
Start-Process -FilePath $py -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000" -WorkingDirectory "$root\backend" -WindowStyle Hidden

Write-Host "==> 启动前端 (127.0.0.1:5173)" -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/c","npm run dev" -WorkingDirectory "$root\frontend" -WindowStyle Hidden

Start-Sleep -Seconds 5
Write-Host ""
Write-Host "  后端 API : http://127.0.0.1:8000/api/health" -ForegroundColor Green
Write-Host "  前端页面 : http://127.0.0.1:5173/" -ForegroundColor Green
Write-Host ""
Write-Host "  （本窗口可关闭，服务在后台运行）"
Start-Process "http://127.0.0.1:5173/"
