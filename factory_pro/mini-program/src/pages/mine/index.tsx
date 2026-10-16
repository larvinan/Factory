import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import { useUserStore } from '@/store/user';
import { UserRoleInfo } from '@/types/user';
import styles from './index.module.scss';

interface MenuItem {
  icon: string;
  label: string;
  desc: string;
  url?: string;
  isTab?: boolean;
  badge?: number;
}

/**
 * 我的 Page
 */
const MinePage: React.FC = () => {
  const { user, login, canControl } = useUserStore();
  const [pendingAlarmCount, setPendingAlarmCount] = useState(3);

  useEffect(() => {
    if (!user) {
      login();
    }
  }, [user, login]);

  useDidShow(() => {
    if (!user) login();
  });

  const menus: MenuItem[] = [
  { icon: '🤖', label: '智能助手', desc: 'AI 答疑·运行状况·功能导览', url: '/pages/assistant/index' },
  { icon: '💬', label: '意见反馈', desc: '反馈问题与改进建议', url: '/pages/feedback/index' },
  { icon: '🏭', label: '工厂管理', desc: '多工厂与车间维护', url: '/pages/factory/index' },
    {
      icon: '🚨',
      label: '告警中心',
      desc: '查看并处理告警',
      isTab: true,
      badge: pendingAlarmCount
    },
    {
      icon: '📝',
      label: '隐患上报',
      desc: '巡检发现隐患，拍照上报',
      url: '/pages/report/index'
    },
    {
      icon: '📋',
      label: '上报历史',
      desc: '查看历史上报记录',
      url: '/pages/report/history'
    },
    {
      icon: '⚙️',
      label: '远程控制',
      desc: canControl() ? '控制电磁阀、排风扇等' : '需管理员权限',
      isTab: true
    },
    {
      icon: '🔔',
      label: '通知设置',
      desc: '管理告警通知偏好',
      url: '/pages/mine/setting'
    }
  ];

  const handleMenuClick = (menu: MenuItem) => {
    if (menu.isTab) {
      if (menu.label === '告警中心') {
        Taro.switchTab({ url: '/pages/alarm/index' });
      } else if (menu.label === '远程控制') {
        Taro.switchTab({ url: '/pages/control/index' });
      }
    } else if (menu.url) {
      Taro.navigateTo({ url: menu.url });
    }
  };

  if (!user) {
    return (
      <View className={styles.page}>
        <View className={styles.userCard}>
          <Text>加载中...</Text>
        </View>
      </View>
    );
  }

  const roleInfo = UserRoleInfo[user.role];

  return (
    <ScrollView scrollY className={styles.page} enhanced bounces showScrollbar={false}>
      {/* 用户信息卡片 */}
      <View className={styles.userCard}>
        <Image className={styles.avatar} src={user.avatar} mode="aspectFill" />
        <View className={styles.userInfo}>
          <Text className={styles.nickname}>{user.nickname}</Text>
          <View className={classnames(styles.roleTag)}>
            <Text>{roleInfo.label}</Text>
          </View>
          <View className={styles.metaRow}>
            {user.department ? <Text>🏢 {user.department}</Text> : null}
            {user.phone ? <Text>📱 {user.phone}</Text> : null}
          </View>
        </View>
      </View>

      {/* 数据统计 */}
      <View className={styles.statsCard}>
        <View className={styles.statItem}>
          <Text className={styles.statNum}>{pendingAlarmCount}</Text>
          <Text className={styles.statLabel}>待处理告警</Text>
        </View>
        <View className={styles.statItem}>
          <Text className={styles.statNum}>12</Text>
          <Text className={styles.statLabel}>本月上报</Text>
        </View>
        <View className={styles.statItem}>
          <Text className={styles.statNum}>28</Text>
          <Text className={styles.statLabel}>处理记录</Text>
        </View>
      </View>

      {/* 菜单列表 */}
      <View className={styles.menuCard}>
        {menus.map((menu, idx) => (
          <View key={idx} className={styles.menuItem} onClick={() => handleMenuClick(menu)}>
            <View className={styles.menuIcon}>
              <Text>{menu.icon}</Text>
            </View>
            <View className={styles.menuContent}>
              <Text className={styles.menuLabel}>{menu.label}</Text>
              <Text className={styles.menuDesc}>{menu.desc}</Text>
            </View>
            {menu.badge && menu.badge > 0 ? (
              <View className={styles.menuBadge}>
                <Text>{menu.badge}</Text>
              </View>
            ) : null}
            <Text className={styles.menuArrow}>›</Text>
          </View>
        ))}
      </View>

      {/* 关于 */}
      <View className={styles.menuCard}>
        <View className={styles.menuItem}>
          <View className={styles.menuIcon}>
            <Text>ℹ️</Text>
          </View>
          <View className={styles.menuContent}>
            <Text className={styles.menuLabel}>关于</Text>
            <Text className={styles.menuDesc}>智慧工厂监控 v1.0.0</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default MinePage;
