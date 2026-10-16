import React, { useState, useCallback } from 'react';
import { View, Text, Input, Textarea, Button, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import dayjs from 'dayjs';
import { BASE_URL } from '@/services/http';
import styles from './index.module.scss';

interface FeedbackItem {
  id: number;
  type: string;
  severity: string;
  title: string;
  content: string;
  contact?: string;
  images?: string;
  status: string;
  reply?: string;
  handledBy?: string;
  reporterName?: string;
  createdAt?: string;
}

const TYPE_OPTIONS = [
  { key: 'bug', label: '功能缺陷', icon: '🐛' },
  { key: 'suggestion', label: '功能建议', icon: '💡' },
  { key: 'experience', label: '体验问题', icon: '😐' },
  { key: 'other', label: '其他', icon: '📝' }
];

const SEVERITY_OPTIONS = [
  { key: 'low', label: '轻微' },
  { key: 'medium', label: '一般' },
  { key: 'high', label: '严重' }
];

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  pending: { label: '待处理', cls: 'stPending' },
  processing: { label: '处理中', cls: 'stProcessing' },
  resolved: { label: '已解决', cls: 'stResolved' },
  closed: { label: '已关闭', cls: 'stClosed' }
};

const typeText = (t: string) => TYPE_OPTIONS.find((o) => o.key === t)?.label || t;
const severityText = (s: string) => SEVERITY_OPTIONS.find((o) => o.key === s)?.label || s;

function parseImages(images?: string): string[] {
  if (!images) return [];
  try {
    const arr = JSON.parse(images);
    return Array.isArray(arr)
      ? arr.map((u: string) => (u.startsWith('http') ? u : `${BASE_URL}${u}`))
      : [];
  } catch {
    return [];
  }
}

const FeedbackPage: React.FC = () => {
  const [type, setType] = useState('bug');
  const [severity, setSeverity] = useState('medium');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [list, setList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await Taro.request({
        url: `${BASE_URL}/api/feedbacks`,
        method: 'GET',
        header: { Authorization: `Bearer ${Taro.getStorageSync('factory_token') || ''}` }
      });
      if (res.statusCode === 200 && res.data?.status === 'ok') {
        setList(res.data.data?.list || []);
      }
    } catch (e) {
      console.error('[Feedback] load list error:', e);
    }
    setLoading(false);
  }, []);

  useDidShow(() => {
    loadList();
  });

  const chooseImage = useCallback(async () => {
    if (images.length >= 3) {
      Taro.showToast({ title: '最多上传 3 张截图', icon: 'none' });
      return;
    }
    try {
      const res = await Taro.chooseImage({ count: 3 - images.length, sizeType: ['compressed'] });
      for (const path of res.tempFilePaths) {
        try {
          const uploadRes = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
            Taro.uploadFile({
              url: `${BASE_URL}/api/upload`,
              filePath: path,
              name: 'image',
              header: { Authorization: `Bearer ${Taro.getStorageSync('factory_token') || ''}` },
              success: (r) => resolve({ statusCode: r.statusCode, data: r.data }),
              fail: (e) => reject(e)
            });
          });
          if (uploadRes.statusCode !== 200) throw new Error('上传失败');
          const parsed = JSON.parse(uploadRes.data);
          const url = parsed?.data?.url;
          if (!url) throw new Error('缺少图片地址');
          setImages((prev) => [...prev, url]);
        } catch (e) {
          Taro.showToast({ title: '截图上传失败', icon: 'none' });
          break; // 一张失败即停，避免连续报错
        }
      }
    } catch {
      // 用户取消选择，忽略
    }
  }, [images.length]);

  const removeImage = useCallback((idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const submit = useCallback(async () => {
    if (!title.trim()) {
      Taro.showToast({ title: '请填写反馈标题', icon: 'none' });
      return;
    }
    if (!content.trim()) {
      Taro.showToast({ title: '请填写详细描述', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await Taro.request({
        url: `${BASE_URL}/api/feedbacks`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Taro.getStorageSync('factory_token') || ''}`
        },
        data: { type, severity, title: title.trim(), content: content.trim(), contact: contact.trim(), images: JSON.stringify(images) }
      });
      if (res.statusCode === 200 && res.data?.status === 'ok') {
        Taro.showToast({ title: '反馈已提交，感谢反馈！', icon: 'success' });
        setTitle('');
        setContent('');
        setContact('');
        setImages([]);
        loadList();
      } else {
        Taro.showToast({ title: res.data?.message || '提交失败', icon: 'none', duration: 2500 });
      }
    } catch (e) {
      console.error('[Feedback] submit error:', e);
      Taro.showToast({ title: '提交失败，请检查网络', icon: 'none' });
    }
    setSubmitting(false);
  }, [type, severity, title, content, contact, images, loadList]);

  return (
    <View className={styles.page}>
      {/* 提交表单 */}
      <View className={styles.panel}>
        <Text className={styles.panelTitle}>✍️ 提交反馈</Text>
        <Text className={styles.panelDesc}>
          反馈使用中遇到的问题或改进建议，帮助我们确定后续调整方向
        </Text>

        <Text className={styles.fieldLabel}>反馈类型</Text>
        <View className={styles.typeRow}>
          {TYPE_OPTIONS.map((o) => (
            <View
              key={o.key}
              className={classnames(styles.typeChip, type === o.key && styles.chipActive)}
              onClick={() => setType(o.key)}
            >
              <Text>{o.icon} {o.label}</Text>
            </View>
          ))}
        </View>

        <Text className={styles.fieldLabel}>影响程度</Text>
        <View className={styles.typeRow}>
          {SEVERITY_OPTIONS.map((o) => (
            <View
              key={o.key}
              className={classnames(
                styles.typeChip,
                styles.sevChip,
                severity === o.key && styles.chipActive,
                severity === o.key && o.key === 'high' && styles.sevHighActive
              )}
              onClick={() => setSeverity(o.key)}
            >
              <Text>{o.label}</Text>
            </View>
          ))}
        </View>

        <Text className={styles.fieldLabel}>标题 *</Text>
        <Input
          className={styles.formInput}
          value={title}
          maxlength={128}
          placeholder="一句话概括问题"
          onInput={(e) => setTitle(e.detail.value)}
        />

        <Text className={styles.fieldLabel}>详细描述 *</Text>
        <Textarea
          className={styles.formTextarea}
          value={content}
          maxlength={2000}
          placeholder={'发生在哪个页面？做了什么操作？期望的表现是什么？'}
          onInput={(e) => setContent(e.detail.value)}
        />

        <Text className={styles.fieldLabel}>联系方式（选填）</Text>
        <Input
          className={styles.formInput}
          value={contact}
          maxlength={64}
          placeholder="微信群 / 手机号，便于回访"
          onInput={(e) => setContact(e.detail.value)}
        />

        <Text className={styles.fieldLabel}>截图（选填，最多3张）</Text>
        <View className={styles.imgRow}>
          {images.map((img, i) => (
            <View key={i} className={styles.imgItem}>
              <Image className={styles.imgThumb} src={img.startsWith('http') ? img : `${BASE_URL}${img}`} mode="aspectFill" />
              <Text className={styles.imgRemove} onClick={() => removeImage(i)}>×</Text>
            </View>
          ))}
          {images.length < 3 && (
            <View className={styles.imgAdd} onClick={chooseImage}>
              <Text className={styles.imgAddIcon}>📷</Text>
              <Text className={styles.imgAddText}>上传</Text>
            </View>
          )}
        </View>

        <Button
          className={classnames(styles.submitBtn, submitting && styles.disabled)}
          loading={submitting}
          onClick={submit}
        >
          提交反馈
        </Button>
      </View>

      {/* 我的反馈列表 */}
      <View className={styles.panel}>
        <View className={styles.listHeader}>
          <Text className={styles.panelTitle}>📋 我的反馈</Text>
          <Text className={styles.refresh} onClick={loadList}>刷新</Text>
        </View>

        {loading && list.length === 0 ? (
          <View className={styles.empty}><Text>加载中...</Text></View>
        ) : list.length === 0 ? (
          <View className={styles.empty}><Text>暂无反馈记录</Text></View>
        ) : (
          list.map((fb) => {
            const st = STATUS_INFO[fb.status] || STATUS_INFO.pending;
            return (
              <View key={fb.id} className={styles.fbItem}>
                <View className={styles.fbTop}>
                  <Text className={styles.fbTitle}>{fb.title}</Text>
                  <Text className={classnames(styles.statusTag, styles[st.cls])}>{st.label}</Text>
                </View>
                <View className={styles.fbTags}>
                  <Text className={styles.fbTag}>{typeText(fb.type)}</Text>
                  <Text className={styles.fbTag}>{severityText(fb.severity)}</Text>
                  <Text className={styles.fbTime}>
                    {fb.createdAt ? dayjs(fb.createdAt).format('MM-DD HH:mm') : ''}
                  </Text>
                </View>
                <Text className={styles.fbContent}>{fb.content}</Text>
                {parseImages(fb.images).length > 0 && (
                  <View className={styles.imgRow}>
                    {parseImages(fb.images).map((img, i) => (
                      <Image key={i} className={styles.imgThumb} src={img} mode="aspectFill" />
                    ))}
                  </View>
                )}
                {fb.reply && (
                  <View className={styles.replyBox}>
                    <Text className={styles.replyLabel}>官方回复：</Text>
                    <Text className={styles.replyText}>{fb.reply}</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
};

export default FeedbackPage;
