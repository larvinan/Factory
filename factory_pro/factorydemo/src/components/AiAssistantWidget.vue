<template>
  <div class="ai-widget">
    <!-- 聊天面板 -->
    <transition name="widget-pop">
      <div v-show="open" class="widget-panel">
        <div class="chat-header">
          <div class="bot-avatar">🤖</div>
          <div class="bot-meta">
            <div class="bot-name">智能助手「小鸿」</div>
            <div class="bot-status">
              <span class="status-dot"></span>
              DeepSeek 驱动 · 全页面可用
            </div>
          </div>
          <button class="icon-btn" title="清空对话" @click="clearChat">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/></svg>
          </button>
          <button class="icon-btn" title="收起 (Esc)" @click="open = false">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div ref="scrollRef" class="chat-body" @scroll="onScroll" @click="onChatClick">
          <div
            v-for="m in messages"
            :key="m.id"
            class="msg-row"
            :class="{ user: m.role === 'user' }"
          >
            <div v-if="m.role === 'ai'" class="avatar ai">🤖</div>
            <div class="bubble" :class="m.role === 'user' ? 'bubble-user' : 'bubble-ai'">
              <div class="bubble-text">
                <span v-if="m.role === 'ai'" v-html="renderMarkdown(m.content)"></span>
                <template v-else>{{ m.content }}</template>
                <span v-if="m.streaming" class="caret"></span>
              </div>
              <div class="bubble-time">{{ m.time }}</div>
            </div>
            <div v-if="m.role === 'user'" class="avatar user">👤</div>
          </div>

          <div v-if="thinking" class="msg-row">
            <div class="avatar ai">🤖</div>
            <div class="bubble bubble-ai">
              <span class="dot-flash"><i></i><i></i><i></i></span>
              <span class="thinking-text">小鸿思考中···</span>
            </div>
          </div>
        </div>

        <div class="quick-bar">
          <button
            v-for="q in quickActions"
            :key="q"
            class="quick-chip"
            :disabled="thinking || generating"
            @click="send(q)"
          >{{ q }}</button>
          <button
            v-for="f in faqs.slice(0, 4)"
            :key="f.id || f.question"
            class="quick-chip faq"
            :disabled="thinking || generating"
            @click="send(f.question)"
          >{{ f.question }}</button>
        </div>

        <div class="input-bar">
          <input
            ref="inputRef"
            v-model="input"
            class="chat-input"
            placeholder="问问小鸿…"
            maxlength="500"
            @keydown.enter="send(input)"
          />
          <button v-if="!generating" class="send-btn" :disabled="!input.trim()" @click="send(input)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
          <button v-else class="send-btn stop" title="停止生成" @click="stopGenerate">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          </button>
        </div>
      </div>
    </transition>

    <!-- 悬浮按钮 -->
    <button class="widget-fab" :class="{ open }" :title="open ? '收起' : 'AI 助手'" @click="open = !open">
      <span v-if="!open" class="fab-emoji">🤖</span>
      <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      <span v-if="!open" class="fab-pulse"></span>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { BASE_URL } from '../utils/request'

const router = useRouter()

const WELCOME = '您好，我是智能助手「小鸿」🤖\n\n我可以帮您：\n· 分析今日工厂运行状况\n· 解答告警处理、设备控制等功能的用法\n· 告诉您某个功能在哪个页面\n\n点击下方快捷问题或直接输入您的问题～'

let msgId = 1
const now = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

const open = ref(false)
const messages = ref([{ id: msgId++, role: 'ai', content: WELCOME, time: now() }])
const input = ref('')
const thinking = ref(false)   // 已发出请求、尚未收到首字节
const generating = ref(false) // 流式接收中（可停止）
const faqs = ref([])
const scrollRef = ref(null)
const inputRef = ref(null)
const quickActions = ['告诉我今日运行状况', '有哪些未处理的告警？', '怎么处理告警？']
let abortController = null
let autoScroll = true

function toggle() {
  open.value = !open.value
  if (open.value) nextTick(() => { scrollToBottom(); inputRef.value?.focus() })
}

// ===== 轻量 Markdown 渲染（AI 回复常见：# 标题 / **加粗** / `代码` / - 列表）=====
// 先整体转义 HTML 再做替换，杜绝 v-html 注入；未闭合的 ** 在流式过程中原样显示，回复完整后即正常渲染
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineMd(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="md-strong">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    // [文本](/内部路径) 渲染为路由链接（点击委托 onChatClick 处理跳转）；http(s) 外链新窗口打开
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
      if (href.startsWith('/')) return `<a class="md-link" data-path="${href}">${text}</a>`
      return `<a class="md-link" href="${href}" target="_blank" rel="noopener">${text}</a>`
    })
}

function renderMarkdown(src) {
  return escapeHtml(src || '').split('\n').map((line) => {
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const cls = h[1].length <= 1 ? 'md-h1' : h[1].length === 2 ? 'md-h2' : 'md-h3'
      return `<span class="${cls}">${inlineMd(h[2])}</span>`
    }
    // 列表项：- / * / • 开头后跟空格（** 开头的加粗行不匹配，不受影响）
    const li = line.match(/^\s*[-*•]\s+(.*)$/)
    if (li) return `<span class="md-li">• ${inlineMd(li[1])}</span>`
    return inlineMd(line)
  }).join('\n')
}

// ===== 流式聊天（不走 request.js，它按 JSON 解析）=====
async function send(text) {
  const msg = (text || '').trim()
  if (!msg || thinking.value || generating.value) return

  messages.value.push({ id: msgId++, role: 'user', content: msg, time: now() })
  input.value = ''
  thinking.value = true
  autoScroll = true
  await scrollToBottom()

  const aiMsg = { id: msgId++, role: 'ai', content: '', time: now(), streaming: true }
  messages.value.push(aiMsg)

  abortController = new AbortController()
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${BASE_URL}/ai/chat?message=${encodeURIComponent(msg)}`, {
      headers: token ? { Authorization: 'Bearer ' + token } : undefined,
      signal: abortController.signal
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

    thinking.value = false
    generating.value = true

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      aiMsg.content += decoder.decode(value, { stream: true })
      if (autoScroll) scrollToBottom()
    }
    if (!aiMsg.content.trim()) {
      aiMsg.content = '（AI 未返回内容，请稍后重试）'
    }
  } catch (e) {
    if (e?.name === 'AbortError') {
      aiMsg.content += '\n（已停止生成）'
    } else {
      aiMsg.content = '抱歉，AI 服务暂时不可用，请检查后端与网络后重试。'
    }
  } finally {
    thinking.value = false
    generating.value = false
    aiMsg.streaming = false
    abortController = null
    scrollToBottom()
  }
}

function stopGenerate() {
  abortController?.abort()
}

function clearChat() {
  if (generating.value) stopGenerate()
  messages.value = [{ id: msgId++, role: 'ai', content: WELCOME, time: now() }]
}

function onScroll() {
  const el = scrollRef.value
  if (!el) return
  autoScroll = el.scrollHeight - el.scrollTop - el.clientHeight < 60
}

// 点击 AI 回复中的内部链接 → 路由跳转并收起浮窗
function onChatClick(e) {
  const a = e.target.closest('a.md-link')
  if (a && a.dataset.path) {
    e.preventDefault()
    router.push(a.dataset.path)
    open.value = false
  }
}

async function scrollToBottom() {
  await nextTick()
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function onKeydown(e) {
  if (e.key === 'Escape' && open.value) open.value = false
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  try {
    const res = await fetch(`${BASE_URL}/ai/faqs`)
    const json = await res.json()
    if (json.status === 'ok') faqs.value = json.data || []
  } catch { /* 静默 */ }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  abortController?.abort()
})
</script>

<style scoped>
.ai-widget {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2500;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}

/* ===== 悬浮按钮 ===== */
.widget-fab {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  background: linear-gradient(135deg, #0ea5c9, #2563eb);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(14, 165, 201, 0.45);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s;
}

.widget-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 8px 26px rgba(14, 165, 201, 0.6);
}

.widget-fab:active {
  transform: scale(0.96);
}

.fab-emoji {
  font-size: 26px;
  line-height: 1;
}

/* 在线呼吸光圈 */
.fab-pulse {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #34d399;
  border: 2px solid #0b1929;
}

.fab-pulse::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: rgba(52, 211, 153, 0.5);
  animation: fab-ring 2s ease-out infinite;
}

@keyframes fab-ring {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(2.6); opacity: 0; }
}

/* ===== 面板入场动画 ===== */
.widget-pop-enter-active,
.widget-pop-leave-active {
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom right;
}

.widget-pop-enter-from,
.widget-pop-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.92);
}

/* ===== 聊天面板 ===== */
.widget-panel {
  width: 400px;
  height: 580px;
  max-height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  background: var(--bg-card, #0d2136);
  border: 1px solid var(--border-color, rgba(64, 158, 255, 0.25));
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 212, 255, 0.08);
}

/* 头部 */
.chat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color, rgba(64, 158, 255, 0.25));
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(37, 99, 235, 0.12));
  flex-shrink: 0;
}

.bot-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(37, 99, 235, 0.25));
  border: 1px solid rgba(0, 212, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.bot-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #e8f1fb);
}

.bot-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-secondary, #8899b0);
  margin-top: 2px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-green, #67c23a);
  box-shadow: 0 0 6px var(--accent-green, #67c23a);
}

.icon-btn {
  margin-left: auto;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #8899b0);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.icon-btn + .icon-btn {
  margin-left: 0;
}

.icon-btn:hover {
  background: rgba(0, 212, 255, 0.1);
  color: var(--text-primary, #e8f1fb);
}

/* 消息区 */
.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.msg-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.avatar.ai {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.18), rgba(37, 99, 235, 0.22));
  border: 1px solid rgba(0, 212, 255, 0.35);
}

.avatar.user {
  background: rgba(15, 36, 64, 0.8);
  border: 1px solid var(--border-color, rgba(64, 158, 255, 0.25));
}

.bubble {
  max-width: 76%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.bubble-ai {
  background: rgba(15, 36, 64, 0.7);
  border: 1px solid var(--border-color, rgba(64, 158, 255, 0.25));
  color: var(--text-primary, #e8f1fb);
  border-top-left-radius: 4px;
}

.bubble-user {
  background: linear-gradient(135deg, rgba(14, 165, 201, 0.85), rgba(37, 99, 235, 0.85));
  color: #fff;
  border-top-right-radius: 4px;
}

.bubble-text {
  white-space: pre-wrap;
  word-break: break-word;
}

/* AI 气泡内 Markdown 元素（v-html 内容需 :deep） */
.bubble-ai :deep(.md-h1),
.bubble-ai :deep(.md-h2) {
  display: block;
  font-weight: 700;
  font-size: 14px;
  color: var(--accent-cyan, #00d4ff);
  margin: 7px 0 2px;
}

.bubble-ai :deep(.md-h1:first-child),
.bubble-ai :deep(.md-h2:first-child) {
  margin-top: 0;
}

.bubble-ai :deep(.md-h3),
.bubble-ai :deep(.md-h4) {
  display: block;
  font-weight: 700;
  font-size: 13px;
  color: var(--text-primary, #e8f1fb);
  margin: 5px 0 2px;
}

.bubble-ai :deep(.md-strong) {
  font-weight: 700;
  color: #fff;
}

.bubble-ai :deep(.md-code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 212, 255, 0.1);
  border: 1px solid rgba(0, 212, 255, 0.2);
  color: var(--accent-cyan, #00d4ff);
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}

.bubble-ai :deep(.md-li) {
  display: block;
  padding-left: 2px;
}

.bubble-ai :deep(.md-link) {
  color: var(--accent-cyan, #00d4ff);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.caret {
  display: inline-block;
  width: 7px;
  height: 14px;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--accent-cyan, #00d4ff);
  animation: blink 0.9s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.bubble-time {
  margin-top: 4px;
  font-size: 10px;
  opacity: 0.55;
  text-align: right;
}

.thinking-text {
  font-size: 12px;
  color: var(--text-secondary, #8899b0);
  margin-left: 8px;
}

.dot-flash {
  display: inline-flex;
  gap: 4px;
  vertical-align: middle;
}

.dot-flash i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-cyan, #00d4ff);
  animation: bounce 1.2s ease-in-out infinite;
}

.dot-flash i:nth-child(2) { animation-delay: 0.15s; }
.dot-flash i:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-5px); opacity: 1; }
}

/* 快捷问题 */
.quick-bar {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  overflow-x: auto;
  border-top: 1px solid var(--border-color, rgba(64, 158, 255, 0.25));
  flex-shrink: 0;
}

.quick-chip {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: 13px;
  border: 1px solid rgba(0, 212, 255, 0.3);
  background: rgba(0, 212, 255, 0.06);
  color: var(--accent-cyan, #00d4ff);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.25s;
  white-space: nowrap;
}

.quick-chip.faq {
  border-color: var(--border-color, rgba(64, 158, 255, 0.25));
  background: rgba(15, 36, 64, 0.6);
  color: var(--text-secondary, #8899b0);
}

.quick-chip:hover:not(:disabled) {
  border-color: var(--accent-cyan, #00d4ff);
  background: rgba(0, 212, 255, 0.12);
}

.quick-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 输入区 */
.input-bar {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color, rgba(64, 158, 255, 0.25));
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid var(--border-color, rgba(64, 158, 255, 0.25));
  background: rgba(6, 13, 24, 0.8);
  color: var(--text-primary, #e8f1fb);
  font-size: 13px;
  outline: none;
  transition: border-color 0.25s;
}

.chat-input:focus {
  border-color: rgba(0, 212, 255, 0.5);
}

.chat-input::placeholder {
  color: var(--text-secondary, #8899b0);
}

.send-btn {
  width: 40px;
  border-radius: 9px;
  border: none;
  background: linear-gradient(135deg, #0ea5c9, #2563eb);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: filter 0.25s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) { filter: brightness(1.15); }
.send-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.send-btn.stop {
  background: rgba(245, 63, 63, 0.85);
}
</style>
