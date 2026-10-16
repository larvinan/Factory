// WebSocket 封装：连接后端 /ws 端点，按 {type, data} 消息格式分发
// 断线自动重连（3 秒退避），页面无需关心连接细节
// hostname 跟随页面访问地址（支持局域网其他电脑打开大屏），不可硬编码 localhost
const WS_URL = `ws://${window.location.hostname}:8000/ws`

let ws = null
let retryTimer = null
const listeners = new Map()

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }
  try {
    ws = new WebSocket(WS_URL)
  } catch (e) {
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    // 连接成功，清掉重连定时器
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === 'pong') return
      const set = listeners.get(msg.type)
      if (set) set.forEach(cb => cb(msg.data))
      // 通配监听器：type: '*' 可收到全部消息
      const all = listeners.get('*')
      if (all) all.forEach(cb => cb(msg))
    } catch (e) { /* 非 JSON 消息忽略 */ }
  }

  ws.onclose = () => scheduleReconnect()
  ws.onerror = () => { /* onclose 会跟着触发，重连在那里做 */ }
}

function scheduleReconnect() {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    connect()
  }, 3000)
}

/**
 * 订阅某类消息：on('sensors', data => {...})
 * type: 'sensors' | 'alert' | 'detection' | 'device_online' | 'device_offline' | '*'
 * 返回取消订阅函数
 */
export function on(type, cb) {
  connect()
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type).add(cb)
  return () => { listeners.get(type)?.delete(cb) }
}

// 心跳保活，避免代理空闲断连（后端 keepalive 60s）
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send('ping')
  }
}, 30000)
