import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import { getNotifySetting, updateNotifySetting } from '@/services/api';
import { NotifySetting } from '@/types/user';
import { DEFAULT_NOTIFY_SETTING } from '@/store/user';
import styles from './index.module.scss';

interface SettingItem {
  key: keyof NotifySetting;
  icon: string;
  label: string;
  desc: string;
  iconType?: 'default' | 'danger' | 'warning';
  dependsOnAll?: boolean;  // 是否受 allAlarm 总开关控制
}

const SETTING_ITEMS: SettingItem[] = [
  {
    key: 'allAlarm',
    icon: '🔔',
    label: '全部告警通知',
    desc: '关闭后将不再接收任何告警推送',
    iconType: 'default'
  },
  {
    key: 'gasAlarm',
    icon: '💨',
    label: '燃气紧急告警',
    desc: '燃气浓度超过报警阈值（500ppm）',
    iconType: 'danger',
    dependsOnAll: true
  },
  {
    key: 'gasWarning',
    icon: '🌫',
    label: '燃气预警',
    desc: '燃气浓度超过预警阈值（200ppm）',
    iconType: 'warning',
    dependsOnAll: true
  },
  {
    key: 'smokeAlarm',
    icon: '🔥',
    label: '烟雾告警',
    desc: '烟雾浓度超过报警阈值',
    iconType: 'danger',
    dependsOnAll: true
  },
  {
    key: 'flameAlarm',
    icon: '🔥',
    label: '火焰告警',
    desc: '检测到火焰信号',
    iconType: 'danger',
    dependsOnAll: true
  },
  {
    key: 'systemOffline',
    icon: '⚠️',
    label: '系统离线通知',
    desc: '边缘端设备离线时通知',
    iconType: 'warning',
    dependsOnAll: true
  }
];

/**
 * 通知设置 Page
 */
const SettingPage: React.FC = () => {
  const [settings, setSettings] = useState<NotifySetting>(DEFAULT_NOTIFY_SETTING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifySetting();
      setSettings(data);
    } catch (err) {
      console.error('[Setting] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleToggle = useCallback(async (key: keyof NotifySetting) => {
    // 受总开关控制的项，总开关关闭时不能单独打开
    const item = SETTING_ITEMS.find(i => i.key === key);
    if (item?.dependsOnAll && !settings.allAlarm && settings[key]) {
      // 关闭的项可以打开，但需提示
    }
    if (item?.dependsOnAll && !settings.allAlarm && !settings[key]) {
      Taro.showToast({ title: '请先开启全部告警通知', icon: 'none' });
      return;
    }

    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);

    // 如果关闭总开关，所有子项也关闭
    if (key === 'allAlarm' && !newSettings.allAlarm) {
      const allOff: NotifySetting = {
        ...newSettings,
        gasWarning: false,
        gasAlarm: false,
        smokeAlarm: false,
        flameAlarm: false,
        systemOffline: false
      };
      setSettings(allOff);
      // 提交全部关闭的设置
      setSaving(true);
      try {
        await updateNotifySetting(allOff);
        Taro.showToast({ title: '已关闭全部告警', icon: 'success' });
      } catch (err) {
        console.error('[Setting] update error:', err);
        Taro.showToast({ title: '保存失败', icon: 'none' });
        setSettings(settings); // 回滚
      } finally {
        setSaving(false);
      }
      return;
    }

    // 单项变更，提交
    setSaving(true);
    try {
      await updateNotifySetting(newSettings);
      Taro.showToast({ title: '已更新', icon: 'success' });
    } catch (err) {
      console.error('[Setting] update error:', err);
      Taro.showToast({ title: '保存失败', icon: 'none' });
      setSettings(settings); // 回滚
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return (
    <ScrollView scrollY className={styles.page} enhanced bounces showScrollbar={false}>
      {/* 顶部提示 */}
      <View className={styles.headerTip}>
        <Text className={styles.tipIcon}>🔔</Text>
        <Text className={styles.tipText}>
          开启通知后，当工厂发生告警时，即使小程序未打开，您也会通过微信「服务通知」收到提醒。
        </Text>
      </View>

      {/* 通知项列表 */}
      <View className={styles.settingCard}>
        {SETTING_ITEMS.map((item) => {
          const value = settings[item.key];
          const isDisabled = item.dependsOnAll && !settings.allAlarm;
          return (
            <View key={item.key} className={styles.settingItem}>
              <View className={styles.itemLeft}>
                <View className={classnames(
                  styles.itemIcon,
                  item.iconType === 'danger' && styles.danger,
                  item.iconType === 'warning' && styles.warning
                )}>
                  <Text>{item.icon}</Text>
                </View>
                <View className={styles.itemInfo}>
                  <Text className={styles.itemLabel}>{item.label}</Text>
                  <Text className={styles.itemDesc}>{item.desc}</Text>
                </View>
              </View>
              <View
                className={classnames(
                  styles.switch,
                  value && styles.active,
                  isDisabled && styles.disabled
                )}
                onClick={() => !isDisabled && !saving && handleToggle(item.key)}
              >
                <View className={classnames(styles.switchThumb, value && styles.active)} />
              </View>
            </View>
          );
        })}
      </View>

      <Text className={styles.footerTip}>
        {loading ? '加载中...' : saving ? '保存中...' : '设置自动保存，无需手动提交'}
        {'\n'}如未收到通知，请在微信设置中检查「智慧工厂监控」的通知权限
      </Text>
    </ScrollView>
  );
};

export default SettingPage;
