export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/alarm/index',
    'pages/alarm/detail',
    'pages/device/index',
    'pages/device/detail',
    'pages/control/index',
    'pages/report/index',
    'pages/report/history',
    'pages/detect/index',
    'pages/inspection/index',
    'pages/inspection/detail',
    'pages/dashboard/index',
    'pages/assistant/index',
    'pages/feedback/index',
    'pages/factory/index',
    'pages/mine/index',
    'pages/mine/setting'
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#1a6dff',
    navigationBarTitleText: '智慧工厂监控',
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: '#86909c',
    selectedColor: '#1a6dff',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '监控',
        iconPath: 'assets/tabbar/home.svg',
        selectedIconPath: 'assets/tabbar/home-selected.svg'
      },
      {
        pagePath: 'pages/alarm/index',
        text: '告警',
        iconPath: 'assets/tabbar/alarm.svg',
        selectedIconPath: 'assets/tabbar/alarm-selected.svg'
      },
      {
        pagePath: 'pages/device/index',
        text: '设备',
        iconPath: 'assets/tabbar/device.svg',
        selectedIconPath: 'assets/tabbar/device-selected.svg'
      },
      {
        pagePath: 'pages/control/index',
        text: '控制',
        iconPath: 'assets/tabbar/control.svg',
        selectedIconPath: 'assets/tabbar/control-selected.svg'
      },
      {
        pagePath: 'pages/detect/index',
        text: '检测',
        iconPath: 'assets/tabbar/detect.svg',
        selectedIconPath: 'assets/tabbar/detect-selected.svg'
      }
    ]
  }
})
