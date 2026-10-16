# FactoryGuard 数据库工具：全库导出（含图片）/ 一键初始化
# 导出/导入使用 Start-Process 文件句柄级重定向（字节直通）——
# 严禁经 PowerShell 管道传输 mysqldump 输出（管道会按系统编码解码再编码：
# 中文注释变乱码、BOM 混入、\" 转义被破坏，实际踩坑修复过）
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'factory\esp32_camera_web\backend-java'
$cfgFile = Join-Path $backend 'config\application.yml'

# 从 setup_config 生成的配置读取数据库连接（无则用默认值）
$dbHost = 'localhost'; $dbPort = '3306'; $dbUser = 'root'; $dbPass = '512021lsm'
if (Test-Path $cfgFile) {
    $raw = Get-Content $cfgFile -Raw -Encoding UTF8
    if ($raw -match 'jdbc:mysql://([^:/\"]+):(\d+)/') { $dbHost = $Matches[1]; $dbPort = $Matches[2] }
    if ($raw -match '(?s)datasource:.*?username:\s*(\S*)') { $dbUser = $Matches[1] }
    if ($raw -match '(?s)datasource:.*?password:\s*(\S*)') { $dbPass = $Matches[1] }
}
Write-Host "数据库连接: $dbHost`:$dbPort  用户: $dbUser" -ForegroundColor Cyan

# 定位 mysql / mysqldump
$mysql = (Get-Command mysql -ErrorAction SilentlyContinue).Source
$dump  = (Get-Command mysqldump -ErrorAction SilentlyContinue).Source
if (-not $mysql -or -not $dump) {
    $bin = Read-Host 'PATH 中未找到 mysql/mysqldump，请输入 MySQL bin 目录（如 D:\\soft\\mysql\\bin）'
    if (-not $dump)  { $dump  = Join-Path $bin 'mysqldump.exe' }
    if (-not $mysql) { $mysql = Join-Path $bin 'mysql.exe' }
}
if (-not (Test-Path $dump))  { Write-Host "[错误] mysqldump 不存在: $dump" -ForegroundColor Red; Read-Host '回车退出'; exit 1 }
if (-not (Test-Path $mysql)) { Write-Host "[错误] mysql 不存在: $mysql" -ForegroundColor Red; Read-Host '回车退出'; exit 1 }

Write-Host ''
Write-Host '========== FactoryGuard 数据库工具 ==========' -ForegroundColor Cyan
Write-Host '  [1] 导出当前数据库（结构+数据+图片资源）'
Write-Host '  [2] 初始化数据库（建库+导入备份+恢复图片，可重复执行）'
$choice = Read-Host '请选择 (1/2)'

if ($choice -eq '1') {
    $stamp  = Get-Date -Format 'yyyyMMdd_HHmm'
    $sqlOut = Join-Path $root "factoryguard_backup_$stamp.sql"
    $errOut = Join-Path $root "_dump_err.txt"
    Write-Host "导出全库到 $sqlOut ..."
    $dumpArgs = @('-h', $dbHost, '-P', $dbPort, '-u', $dbUser)
    if ($dbPass) { $dumpArgs += "-p$dbPass" }
    $dumpArgs += @('--databases', 'factoryguard', '--default-character-set=utf8mb4',
        '--add-drop-database', '--single-transaction', '--routines', '--triggers')
    $proc = Start-Process -FilePath $dump -ArgumentList $dumpArgs `
        -RedirectStandardOutput $sqlOut -RedirectStandardError $errOut `
        -Wait -NoNewWindow -PassThru
    if ($proc.ExitCode -ne 0 -or -not (Test-Path $sqlOut) -or (Get-Item $sqlOut).Length -lt 1024) {
        Write-Host "[错误] mysqldump 导出失败，错误信息：" -ForegroundColor Red
        Get-Content $errOut | Write-Host -ForegroundColor Red
        Read-Host '回车退出'; exit 1
    }

    $imgOut = Join-Path $root 'factoryguard_images_backup'
    if (Test-Path (Join-Path $backend 'data')) {
        if (Test-Path $imgOut) { Remove-Item $imgOut -Recurse -Force }
        Copy-Item (Join-Path $backend 'data') $imgOut -Recurse
        Write-Host "图片资源已备份到 $imgOut"
    }
    $size = '{0:N1} KB' -f ((Get-Item $sqlOut).Length / 1KB)
    Write-Host "[完成] 导出成功: $sqlOut ($size)" -ForegroundColor Green
    Write-Host '把 .sql 与 factoryguard_images_backup 一起发给对方即可。'
}
elseif ($choice -eq '2') {
    $sqlFiles = Get-ChildItem $root -Filter 'factoryguard_backup_*.sql' | Sort-Object Name -Descending
    if (-not $sqlFiles) { Write-Host '[错误] 当前目录没有 factoryguard_backup_*.sql 备份文件' -ForegroundColor Red; Read-Host '回车退出'; exit 1 }
    $sqlFile = $sqlFiles[0].FullName
    Write-Host "使用备份: $($sqlFiles[0].Name)"
    Write-Host "初始化数据库 $dbHost`:$dbPort（将覆盖同名 factoryguard 库）..."
    $mysqlArgs = @('-h', $dbHost, '-P', $dbPort, '-u', $dbUser)
    if ($dbPass) { $mysqlArgs += "-p$dbPass" }
    $mysqlArgs += @('--default-character-set=utf8mb4')
    $proc = Start-Process -FilePath $mysql -ArgumentList $mysqlArgs `
        -RedirectStandardInput $sqlFile -RedirectStandardError (Join-Path $root '_import_err.txt') `
        -Wait -NoNewWindow -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Host '[错误] 导入失败，错误信息：' -ForegroundColor Red
        Get-Content (Join-Path $root '_import_err.txt') | Write-Host -ForegroundColor Red
        Read-Host '回车退出'; exit 1
    }

    $imgSrc = Join-Path $root 'factoryguard_images_backup'
    if (Test-Path $imgSrc) {
        if (Test-Path (Join-Path $backend 'data')) { Remove-Item (Join-Path $backend 'data') -Recurse -Force }
        Copy-Item $imgSrc (Join-Path $backend 'data') -Recurse
        Write-Host '图片资源已恢复到 backend-java\data'
    }
    Write-Host '[完成] 数据库初始化成功（账号/数据/图片全部就绪）' -ForegroundColor Green
    Write-Host '请重启后端使连接生效。'
}
else {
    Write-Host '已取消'
}
