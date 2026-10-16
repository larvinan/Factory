export default {
  status: 'ok',
  data: [
    { id: 4, workshopId: 3, workshopName: '3号车间', title: '3号车间消防专项巡检', description: '检查火焰传感器及消防设施', inspectorName: '王五', status: 'in_progress', priority: 'urgent', scheduledDate: '2026-08-26', dueDate: '2026-08-26', itemsJson: '[{"item":"火焰传感器灵敏度","required":true},{"item":"灭火器压力","required":true},{"item":"烟感探测器","required":true}]', resultNote: null, completedAt: null, createdAt: '2026-08-26T11:20:09' },
    { id: 1, workshopId: 1, workshopName: '1号车间', title: '1号车间日常安全巡检', description: '检查温湿度设备运行状态、燃气泄漏、消防通道畅通', inspectorName: '张三', status: 'assigned', priority: 'high', scheduledDate: '2026-08-26', dueDate: '2026-08-27', itemsJson: '[{"item":"温湿度设备运行状态","required":true},{"item":"燃气管道密封性","required":true},{"item":"消防通道畅通","required":true}]', resultNote: null, completedAt: null, createdAt: '2026-08-26T11:20:09' },
    { id: 2, workshopId: 1, workshopName: '1号车间', title: '1号车间设备点检', description: '检查电磁阀、排风扇、蜂鸣器功能正常', inspectorName: '李四', status: 'pending', priority: 'normal', scheduledDate: '2026-08-26', dueDate: '2026-08-28', itemsJson: '[{"item":"电磁阀开关测试","required":true},{"item":"排风扇运转测试","required":true}]', resultNote: null, completedAt: null, createdAt: '2026-08-26T11:20:09' },
    { id: 3, workshopId: 2, workshopName: '2号车间', title: '2号车间环境巡检', description: '检查温湿度及通风设备', inspectorName: null, status: 'pending', priority: 'normal', scheduledDate: '2026-08-26', dueDate: '2026-08-29', itemsJson: '[{"item":"温湿度传感器校准","required":true},{"item":"通风设备运行","required":true}]', resultNote: null, completedAt: null, createdAt: '2026-08-26T11:20:09' },
  ],
};
