export default function detectImage(params?: any) {
  return {
    detectionId: 101,
    imageId: 'abc123def456',
    persons: [
      {
        status: 'compliant',
        confidence: 0.9467,
        bbox: [120, 80, 280, 320]
      },
      {
        status: 'no_helmet',
        confidence: 0.8912,
        bbox: [340, 100, 480, 350]
      },
      {
        status: 'compliant',
        confidence: 0.9234,
        bbox: [500, 60, 640, 300]
      }
    ],
    summary: {
      total_persons: 3,
      compliant: 2,
      no_helmet: 1,
      unknown: 0
    },
    alertMessage: '检测到1人未佩戴安全帽，已生成告警',
    suggestions: [
      { text: '立即通知现场安全员前往该区域处理', priority: 'high' },
      { text: '提醒违规人员立即佩戴安全帽后方可继续作业', priority: 'high' },
      { text: '通过现场广播/蜂鸣器提醒人员佩戴安全帽', priority: 'medium' },
      { text: '对违规人员进行安全教育培训并考核', priority: 'medium' },
      { text: '记录本次违规情况并纳入安全绩效考核', priority: 'low' }
    ]
  };
}
