// Mock: getNotifySetting 云函数
import { NotifySetting } from '@/types/user';

export default function (): NotifySetting {
  return {
    gasWarning: true,
    gasAlarm: true,
    smokeAlarm: true,
    flameAlarm: true,
    systemOffline: true,
    allAlarm: true
  };
}
