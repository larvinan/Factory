// Mock: reportHazard 云函数
export default function (): { id: string } {
  return { id: 'hazard_' + Date.now() };
}
