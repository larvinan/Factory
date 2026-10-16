import React, { useEffect } from 'react';
import { useDidShow, useDidHide } from '@tarojs/taro';
import Taro from '@tarojs/taro';
import { useUserStore } from '@/store/user';
// 全局样式
import './app.scss';

function App(props) {
  useEffect(() => {
    // 仅在微信平台初始化云开发
    if (process.env.TARO_ENV === 'weapp') {
      Taro.cloud.init({ env: '', traceUser: true });
    }
    // 尝试登录恢复用户状态
    const userStore = useUserStore.getState();
    userStore.login().catch((err) => {
      console.error('[App] auto login failed:', err);
    });
  }, []);

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
