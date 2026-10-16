import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Input, ScrollView, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import { BASE_URL } from '@/services/http';
import styles from './index.module.scss';

interface ChatMessage {
  id: number;
  role: 'user' | 'ai';
  content: string;
  time: string;
}

interface FaqItem {
  id?: number;
  question: string;
  answer?: string;
  sortOrder?: number;
}

const WELCOME = '您好，我是智能助手「小鸿」🤖\n\n我可以帮您：\n· 分析今日工厂运行状况\n· 解答告警处理、设备控制等功能的用法\n· 告诉您某个功能在哪个页面\n\n点击下方快捷问题或直接输入您的问题～';

const QUICK_ACTIONS = ['告诉我今日运行状况', '有哪些未处理的告警？', '怎么处理告警？'];

let msgId = 1;
const now = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const AssistantPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: msgId++, role: 'ai', content: WELCOME, time: now() }
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const scrollRef = useRef<string>('');
  const bottomRef = useRef<any>(null);

  useEffect(() => {
    // 加载预设问题
    Taro.request({
      url: `${BASE_URL}/api/ai/faqs`,
      method: 'GET',
      timeout: 10000
    }).then((res) => {
      if (res.statusCode === 200 && res.data?.status === 'ok') {
        setFaqs(res.data.data || []);
      }
    }).catch(() => { /* ignore */ });
  }, []);

  // 新消息滚动到底部：ScrollView 的 scrollIntoView 指向底部锚点元素
  useEffect(() => {
    scrollRef.current = 'chat-bottom';
  }, [messages.length]);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || thinking) return;

    setMessages((prev) => [...prev, { id: msgId++, role: 'user', content: msg, time: now() }]);
    setInput('');
    setThinking(true);

    try {
      const res = await Taro.request({
        url: `${BASE_URL}/api/ai/chat?message=${encodeURIComponent(msg)}`,
        method: 'GET',
        timeout: 60000,
        header: { Authorization: `Bearer ${Taro.getStorageSync('factory_token') || ''}` }
      });
      if (res.statusCode === 200 && typeof res.data === 'string' && res.data.trim()) {
        setMessages((prev) => [...prev, { id: msgId++, role: 'ai', content: res.data.trim(), time: now() }]);
      } else if (res.statusCode === 200) {
        setMessages((prev) => [...prev, { id: msgId++, role: 'ai', content: '（AI 未返回内容，请稍后重试）', time: now() }]);
      } else {
        throw new Error(`HTTP ${res.statusCode}`);
      }
    } catch (e) {
      console.error('[Assistant] chat error:', e);
      setMessages((prev) => [...prev, {
        id: msgId++,
        role: 'ai',
        content: '抱歉，AI 服务暂时不可用，请检查后端与网络后重试。',
        time: now()
      }]);
    } finally {
      setThinking(false);
    }
  }, [thinking]);

  const handleSend = useCallback(() => send(input), [send, input]);

  return (
    <View className={styles.page}>
      <ScrollView
        className={styles.chatArea}
        scrollY
        scrollIntoView={scrollRef.current}
        scrollWithAnimation
      >
        {messages.map((m) => (
          <View key={m.id} className={classnames(styles.msgRow, m.role === 'user' && styles.msgRowUser)}>
            {m.role === 'ai' && (
              <View className={classnames(styles.avatar, styles.avatarAi)}>
                <Text className={styles.avatarEmoji}>🤖</Text>
              </View>
            )}
            <View className={classnames(styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi)}>
              <Text className={styles.bubbleText}>{m.content}</Text>
              <Text className={styles.bubbleTime}>{m.time}</Text>
            </View>
            {m.role === 'user' && (
              <View className={classnames(styles.avatar, styles.avatarUser)}>
                <Text className={styles.avatarEmoji}>👤</Text>
              </View>
            )}
          </View>
        ))}

        {thinking && (
          <View className={styles.msgRow}>
            <View className={classnames(styles.bubble, styles.bubbleAi)}>
              <Text className={styles.thinkingText}>小鸿思考中···</Text>
            </View>
          </View>
        )}
        <View id="chat-bottom" className={styles.bottomSpacer} />
      </ScrollView>

      {/* 快捷问题 */}
      <ScrollView scrollX className={styles.quickBar} enhanced showScrollbar={false}>
        {QUICK_ACTIONS.map((q) => (
          <View key={q} className={classnames(styles.quickChip, thinking && styles.quickDisabled)} onClick={() => send(q)}>
            <Text>{q}</Text>
          </View>
        ))}
        {faqs.slice(0, 5).map((f) => (
          <View key={f.id || f.question} className={classnames(styles.quickChip, thinking && styles.quickDisabled)} onClick={() => send(f.question)}>
            <Text>{f.question}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 输入区 */}
      <View className={styles.inputBar}>
        <Input
          className={styles.input}
          value={input}
          placeholder="问问小鸿：功能在哪 / 今日状况…"
          maxlength={500}
          confirmType="send"
          onInput={(e) => setInput(e.detail.value)}
          onConfirm={handleSend}
        />
        <Button
          className={classnames(styles.sendBtn, (!input.trim() || thinking) && styles.sendDisabled)}
          disabled={!input.trim() || thinking}
          onClick={handleSend}
        >
          发送
        </Button>
      </View>
    </View>
  );
};

export default AssistantPage;
