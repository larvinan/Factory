# -*- coding: utf-8 -*-
"""
QQ SMTP 连通性测试（与后端 application.yml 使用同一套配置）
从 yml 解析 ${MAIL_USERNAME:默认值} 占位符的默认值，授权码不在输出中显示
"""
import re
import smtplib
import ssl
import sys
from email.mime.text import MIMEText
from email.header import Header

YML = r"F:\project_total\java_total\factory_pro_gpt01\factory\esp32_camera_web\backend-java\src\main\resources\application.yml"

def load_placeholder(name):
    """解析 ${NAME:默认值} 占位符中的默认值"""
    text = open(YML, encoding="utf-8").read()
    m = re.search(r"\$\{" + name + r":([^}]*)\}", text)
    return m.group(1).strip() if m else ""

def mask(s):
    return s[:2] + "****" + s[-2:] if s and len(s) > 6 else ("[空]" if not s else "[过短]")

username = load_placeholder("MAIL_USERNAME")
auth_code = load_placeholder("MAIL_AUTH_CODE")

print("1) 配置读取:")
print(f"   发件邮箱 MAIL_USERNAME = {username or '[空]'}")
print(f"   授权码 MAIL_AUTH_CODE  = {mask(auth_code)} (长度 {len(auth_code)})")
if not username or not auth_code:
    print("   [失败] 发件邮箱或授权码未填写，请先编辑 application.yml 第 22~23 行")
    sys.exit(1)
if len(auth_code) != 16:
    print("   [警告] QQ 授权码应为 16 位，当前长度不符，可能复制不全")

print("\n2) 连接 smtp.qq.com:465 (SSL)...")
try:
    server = smtplib.SMTP_SSL("smtp.qq.com", 465, timeout=15,
                              context=ssl.create_default_context())
    print("   [OK] 连接成功")
except Exception as e:
    print(f"   [失败] 连接失败: {e}")
    print("   提示: 465 端口被防火墙拦截时改用 587 + STARTTLS")
    sys.exit(1)

print("\n3) SMTP 登录（授权码认证）...")
try:
    server.login(username, auth_code)
    print("   [OK] 认证成功，授权码有效")
except smtplib.SMTPAuthenticationError as e:
    print(f"   [失败] 认证被拒绝 (代码 {e.smtp_code})")
    print("   常见原因: 授权码复制不全 / 用了QQ登录密码 / SMTP服务未开启")
    print("   重新生成: QQ邮箱网页版 → 设置 → 账户 → SMTP服务 → 生成授权码")
    server.quit(); sys.exit(1)
except Exception as e:
    print(f"   [失败] {e}")
    server.quit(); sys.exit(1)

print("\n4) 发送测试邮件...")
try:
    msg = MIMEText("这是 FactoryGuard 反馈邮件链路的测试邮件，收到即代表配置正确。", "plain", "utf-8")
    msg["Subject"] = Header("[测试] FactoryGuard 邮件链路验证", "utf-8")
    msg["From"] = username
    msg["To"] = username
    server.sendmail(username, [username], msg.as_string())
    print(f"   [OK] 已发送至 {username}，请检查收件箱（含垃圾邮件）")
except Exception as e:
    print(f"   [失败] {e}")

server.quit()
print("\n结论: 以上全部 [OK] 则说明配置正确 —— 重启后端即可生效")
print("(当前运行中的后端是在配置填写前启动的，内存里还是旧配置)")
