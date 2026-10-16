# FactoryGuard 环境配置向导
# 生成的配置文件被 Spring Boot 自动加载（backend-java/config/application.yml），
# 优先级高于项目内置 application.yml —— IDEA 启动与命令行启动均生效
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cfgDir = Join-Path $root 'factory\esp32_camera_web\backend-java\config'
$cfgFile = Join-Path $cfgDir 'application.yml'
$valuesFile = Join-Path $cfgDir '.last_values'

# 上次配置作为本次默认值
$def = @{ host='localhost'; port='3306'; user='root'; pass='512021lsm'; mqtt='tcp://localhost:1883'; mail=''; code=''; notify='' }
if (Test-Path $valuesFile) {
    Get-Content $valuesFile -Encoding UTF8 | ForEach-Object {
        $kv = $_ -split '=', 2
        if ($kv.Count -eq 2 -and $def.ContainsKey($kv[0].Trim())) { $def[$kv[0].Trim()] = $kv[1].Trim() }
    }
}

Write-Host ''
Write-Host '========== FactoryGuard 环境配置向导 ==========' -ForegroundColor Cyan
Write-Host '把项目分发到其他电脑后，在这里填入对方机器的环境信息。'
Write-Host '直接回车 = 使用 [方括号] 中的当前值。'
Write-Host ''

function Ask($label, $key) {
    $v = Read-Host "$label [$($def[$key])]"
    if ([string]::IsNullOrWhiteSpace($v)) { return $def[$key] }
    $def[$key] = $v.Trim()
    return $def[$key]
}

$dbHost = Ask 'MySQL 地址' 'host'
$dbPort = Ask 'MySQL 端口' 'port'
$dbUser = Ask 'MySQL 用户名' 'user'
$dbPass = Ask 'MySQL 密码（若 root 为空密码请输入 NONE）' 'pass'
if ($dbPass -eq 'NONE') { $dbPass = '' }
$mqtt   = Ask 'MQTT Broker 地址（本机默认即可）' 'mqtt'
Write-Host ''
Write-Host '---- 以下为 QQ 邮箱配置（反馈邮件通知），全部回车跳过则沿用主配置 ----'
$mail   = Ask '发件 QQ 邮箱' 'mail'
$code   = Ask 'SMTP 授权码（16 位）' 'code'
$notify = Ask '接收通知的邮箱' 'notify'

# 生成 Spring Boot 外部化配置（邮箱留空则不写，沿用主 yml 的配置）
$lines = @(
    '# ============================================',
    '# 本文件由 setup_config.bat 生成（环境差异覆盖配置）',
    '# 修改后重启后端生效；删除本文件即恢复项目默认配置',
    '# ============================================',
    'spring:',
    '  datasource:',
    # allowPublicKeyRetrieval=true：MySQL 8 默认认证插件 caching_sha2_password 必须，
    # 否则新环境首次连接报 "Public Key Retrieval is not allowed"，后端全部接口 500
    "    url: jdbc:mysql://${dbHost}:${dbPort}/factoryguard?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8&allowPublicKeyRetrieval=true",
    "    username: ${dbUser}",
    "    password: ${dbPass}"
)
if ($mail -and $code) {
    $lines += @(
        '  mail:',
        "    username: ${mail}",
        "    password: ${code}",
        '    default-encoding: UTF-8',
        '    properties:',
        '      mail:',
        '        smtp:',
        '          auth: true',
        '          ssl:',
        '            enable: true'
    )
    $notifyTo = if ($notify) { $notify } else { $mail }
    $lines += @('mail:', "  notify-to: ${notifyTo}")
}
$lines += @(
    'mqtt:',
    '  local:',
    "    host: ${mqtt}"
)

New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
$lines | Out-File -FilePath $cfgFile -Encoding utf8

# 记录本次输入，作为下次向导的默认值
$def.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } | Out-File -FilePath $valuesFile -Encoding utf8

Write-Host ''
Write-Host "[完成] 配置已写入: $cfgFile" -ForegroundColor Green
Write-Host '该文件会被 Spring Boot 自动加载（优先于内置配置），重启后端生效。'
Write-Host '数据库初始化请运行 db_tool.bat（会自动读取此处的连接信息）。'
