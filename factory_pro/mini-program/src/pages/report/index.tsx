import React, { useState, useCallback } from 'react';
import { View, Text, Input, Textarea, Image, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import { reportHazard } from '@/services/api';
import { BASE_URL } from '@/services/http';
import { HazardType, HazardTypeInfo } from '@/types/hazard';
import styles from './index.module.scss';

const HAZARD_TYPES: HazardType[] = [
  'fire', 'gas_leak', 'electrical', 'structural',
  'blockage', 'violation', 'storage', 'other'
];

/**
 * 隐患上报 Page
 */
const ReportPage: React.FC = () => {
  const [imagePath, setImagePath] = useState('');
  const [type, setType] = useState<HazardType>('electrical');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 选择图片
  const handleChooseImage = useCallback(async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      });
      const path = res.tempFilePaths[0];
      setImagePath(path);
      console.info('[Report] picked image:', path);
    } catch (err: any) {
      // 忽略用户主动取消操作的错误 (errorCode: 11)
      if (err?.errMsg && String(err.errMsg).indexOf('cancel') === -1) {
        console.error('[Report] chooseImage error:', err);
      }
    }
  }, []);

  // 移除图片
  const handleRemoveImage = useCallback(() => {
    setImagePath('');
  }, []);

  // 提交上报
  const handleSubmit = useCallback(async () => {
    if (!imagePath) {
      Taro.showToast({ title: '请先拍照或选择图片', icon: 'none' });
      return;
    }
    if (!description.trim()) {
      Taro.showToast({ title: '请填写隐患描述', icon: 'none' });
      return;
    }
    if (!location.trim()) {
      Taro.showToast({ title: '请填写隐患位置', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      // 上传图片：小程序端（支付宝/微信）先传图再上报 URL；H5 端无法访问本地路径，跳过上传
      let imageUrl = imagePath;
      if (process.env.TARO_ENV !== 'h5' && imagePath) {
        const uploadRes = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
          Taro.uploadFile({
            url: `${BASE_URL}/api/upload`,
            filePath: imagePath,
            name: 'image',
            header: {
              'Authorization': `Bearer ${Taro.getStorageSync('factory_token') || ''}`
            },
            success: (r) => resolve({ statusCode: r.statusCode, data: r.data }),
            fail: (e) => reject(e)
          });
        });
        if (uploadRes.statusCode !== 200) {
          // 图片没传上去就提交会把本地临时路径存进数据库，其他端无法访问——直接中断
          throw new Error('图片上传失败，请检查网络后重试');
        }
        try {
          const parsed = JSON.parse(uploadRes.data);
          imageUrl = parsed?.data?.url || parsed?.url || '';
          if (!imageUrl) throw new Error('上传响应缺少图片地址');
        } catch (e) {
          if (e instanceof Error && e.message.includes('缺少图片地址')) throw e;
          throw new Error('图片上传响应异常，请重试');
        }
      }

      await reportHazard({
        type,
        description: description.trim(),
        location: location.trim(),
        imageUrl
      });

      Taro.showToast({ title: '上报成功', icon: 'success' });
      setTimeout(() => {
        Taro.navigateBack();
      }, 1200);
    } catch (err) {
      console.error('[Report] submit error:', err);
      Taro.showToast({
        title: err instanceof Error ? err.message : '上报失败，请重试',
        icon: 'none',
        duration: 2500
      });
    } finally {
      setSubmitting(false);
    }
  }, [imagePath, type, description, location]);

  return (
    <View className={styles.page}>
      {/* 拍照选择 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>
          现场照片<Text className={styles.required}>*</Text>
        </Text>
        {imagePath ? (
          <View className={styles.pickedImageWrap}>
            <Image className={styles.pickedImage} src={imagePath} mode="aspectFill" />
            <View className={styles.removeBtn} onClick={handleRemoveImage}>
              <Text>×</Text>
            </View>
          </View>
        ) : (
          <View className={styles.imagePicker} onClick={handleChooseImage}>
            <Text className={styles.pickIcon}>📷</Text>
            <Text className={styles.pickText}>点击拍照或从相册选择</Text>
          </View>
        )}
      </View>

      {/* 隐患类型 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>
          隐患类型<Text className={styles.required}>*</Text>
        </Text>
        <View className={styles.typeGrid}>
          {HAZARD_TYPES.map((t) => {
            const info = HazardTypeInfo[t];
            const isActive = type === t;
            return (
              <View
                key={t}
                className={classnames(styles.typeItem, isActive && styles.active)}
                onClick={() => setType(t)}
              >
                <Text className={styles.typeIcon}>{info.icon}</Text>
                <Text className={classnames(styles.typeLabel, isActive && styles.active)}>{info.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* 隐患描述 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>
          隐患描述<Text className={styles.required}>*</Text>
        </Text>
        <View className={styles.formRow}>
          <Textarea
            className={styles.formTextarea}
            placeholder="请详细描述发现的安全隐患情况..."
            value={description}
            onInput={(e) => setDescription(e.detail.value)}
            maxlength={300}
          />
        </View>
        <View className={styles.formRow}>
          <Text className={styles.formLabel}>隐患位置<Text className={styles.required}>*</Text></Text>
          <Input
            className={styles.formInput}
            placeholder="如：1号车间-3号机台"
            value={location}
            onInput={(e) => setLocation(e.detail.value)}
            maxlength={50}
          />
        </View>
      </View>

      {/* 底部提交按钮 */}
      <View className={styles.footerBar}>
        <Button
          className={classnames(styles.submitBtn, submitting && styles.disabled)}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? '提交中...' : '提交上报'}
        </Button>
      </View>
    </View>
  );
};

export default ReportPage;
