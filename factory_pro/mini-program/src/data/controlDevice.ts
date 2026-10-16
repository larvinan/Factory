// Mock: controlDevice 云函数
export default function (params?: { target?: string; action?: string }): { success: boolean; message: string } {
  console.log('[Mock] controlDevice:', params);
  return {
    success: true,
    message: `已下发 ${params?.action || '操作'} 指令到 ${params?.target || '设备'}`
  };
}
