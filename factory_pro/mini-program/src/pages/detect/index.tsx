import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Image, Button, ScrollView, Switch, Camera } from '@tarojs/components';
import Taro, { useDidHide } from '@tarojs/taro';
import classnames from 'classnames';
import {
  getDetectionStats,
  getDetectionList,
  analyzeEnvironment,
  exportReport,
  EnvAnalysisResult,
  EnvLevel
} from '@/services/api';
import { BASE_URL } from '@/services/http';
import styles from './index.module.scss';

interface DetectionPerson {
  status: 'compliant' | 'no_helmet';
  confidence: number;
  bbox?: number[];
}

interface Suggestion {
  text: string;
  priority: 'high' | 'medium' | 'low';
}

interface DetectionResult {
  detectionId?: number;
  imageId?: string;
  persons: DetectionPerson[];
  summary: {
    total_persons: number;
    compliant: number;
    no_helmet: number;
    unknown: number;
  };
  imageUrl?: string;
  annotatedImage?: string;  // base64 标注图
  suggestions?: Suggestion[];
  alertMessage?: string;
  error?: string;
}

interface DetectionRecord {
  id: number;
  timestamp: string;
  deviceId: string;
  camera: string;
  total: number;
  compliant: number;
  noHelmet: number;
}

const DetectPage: React.FC = () => {
  const [stats, setStats] = useState({ totalDetections: 0, totalPersons: 0, compliant: 0, noHelmet: 0 });
  const [imagePath, setImagePath] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [records, setRecords] = useState<DetectionRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // 环境安全分析
  const [envAnalysis, setEnvAnalysis] = useState<EnvAnalysisResult | null>(null);
  const [envAnalyzing, setEnvAnalyzing] = useState(false);
  const [autoControl, setAutoControl] = useState(false);

  // 摄像头实时监控
  const [liveMode, setLiveMode] = useState(false);
  const [liveDetecting, setLiveDetecting] = useState(false);
  const [liveLastResult, setLiveLastResult] = useState<DetectionResult | null>(null);
  const [liveAlertCount, setLiveAlertCount] = useState(0);
  const [livePlatform, setLivePlatform] = useState<'h5' | 'alipay'>('alipay');
  // 视频源：local=手机/电脑相机，stream=RK3568 上传的远程视频流
  const [liveSource, setLiveSource] = useState<'local' | 'stream'>('local');
  const [streamUrl, setStreamUrl] = useState('');
  const [streamInfo, setStreamInfo] = useState<{ available: boolean; deviceId: string; timestamp: string; frameAgeSeconds?: number; framesReceived?: number } | null>(null);
  const [autoDetectOn, setAutoDetectOn] = useState(true);
  const cameraCtxRef = useRef<any>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveStopFlagRef = useRef(false);
  // 远程流专用：画面轮询 / 定时检测计时器 / 防重入
  const streamPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDetectRef = useRef(true);
  const streamDetectingRef = useRef(false);
  // 帧龄（秒）：后端 /api/stream/info 返回，>15s 说明硬件没在推帧（当前是旧帧）
  const streamFrameAgeRef = useRef<number>(Infinity);
  // 帧停更提示只弹一次；帧恢复新鲜后重置，可再次提醒
  const streamStaleNotifiedRef = useRef(false);
  // H5 电脑摄像头专用
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 报告导出
  const [exporting, setExporting] = useState<'word' | 'pdf' | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const data = await getDetectionStats();
      setStats(data);
    } catch { /* ignore */ }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDetectionList({ page: 1, pageSize: 10 });
      setRecords(res.list || res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadEnvAnalysis = useCallback(async (ac: boolean) => {
    setEnvAnalyzing(true);
    try {
      const data = await analyzeEnvironment(ac);
      setEnvAnalysis(data);
    } catch { /* ignore */ }
    setEnvAnalyzing(false);
  }, []);

  useEffect(() => {
    loadStats();
    loadRecords();
    loadEnvAnalysis(false);
  }, [loadStats, loadRecords, loadEnvAnalysis]);

  const handleAutoControlChange = useCallback((val: boolean) => {
    setAutoControl(val);
    loadEnvAnalysis(val);
  }, [loadEnvAnalysis]);

  // 导出报告
  const handleExport = useCallback(async (fmt: 'word' | 'pdf') => {
    if (exporting) return;
    setExporting(fmt);
    try {
      await exportReport(fmt);
      Taro.showToast({ title: '报告导出成功', icon: 'success' });
    } catch (err: any) {
      console.error('[Export] error:', err);
      Taro.showToast({
        title: `导出失败：${err?.message || '请稍后重试'}`,
        icon: 'none',
        duration: 2500
      });
    } finally {
      setExporting(null);
    }
  }, [exporting]);

  // ===== 摄像头实时监控 =====
  // H5：电脑摄像头 getUserMedia + canvas 截屏
  // 支付宝小程序：Camera 组件 + createCameraContext.takePhoto
  // RK3568 远程流：downloadFile 拉取后端最新帧后上传检测
  const runOneDetection = useCallback(async (filePath: string, camera: string = 'live'): Promise<DetectionResult | null> => {
    try {
      const uploadRes = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
        Taro.uploadFile({
          url: `${BASE_URL}/api/detections/detect`,
          filePath,
          name: 'image',
          formData: { deviceId: 'mp_user', camera },
          header: { 'Authorization': `Bearer ${Taro.getStorageSync('factory_token') || ''}` },
          success: (r) => resolve({ statusCode: r.statusCode, data: r.data }),
          fail: (e) => reject(e)
        });
      });
      if (uploadRes.statusCode !== 200) return null;
      const parsed = JSON.parse(uploadRes.data);
      if (parsed.status !== 'ok') return null;
      const d = parsed.data;
      return { ...d, annotatedImage: d.annotated_image } as DetectionResult;
    } catch (err) {
      console.error('[Live] detect error:', err);
      return null;
    }
  }, []);

  // H5 专用：用 fetch + FormData 上传 Blob 到后端
  const runOneDetectionH5 = useCallback(async (blob: Blob): Promise<DetectionResult | null> => {
    try {
      const fd = new FormData();
      fd.append('image', blob, 'live.jpg');
      fd.append('deviceId', 'mp_user');
      fd.append('camera', 'live_usb');
      const token = Taro.getStorageSync('factory_token') || '';
      const res = await fetch(`${BASE_URL}/api/detections/detect`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!res.ok) return null;
      const parsed = await res.json();
      if (parsed.status !== 'ok') return null;
      const d = parsed.data;
      return { ...d, annotatedImage: d.annotated_image } as DetectionResult;
    } catch (err) {
      console.error('[Live H5] detect error:', err);
      return null;
    }
  }, []);

  // 统一处理检测结果
  const applyDetection = useCallback((det: DetectionResult | null) => {
    if (!det) return;
    setLiveLastResult(det);
    loadStats();
    if (det.summary?.no_helmet > 0) {
      setLiveAlertCount((c) => c + 1);
      Taro.vibrateShort({ type: 'heavy' });
      Taro.showToast({
        title: `警告：${det.summary.no_helmet}人未戴安全帽！`,
        icon: 'none',
        duration: 2500
      });
    }
  }, [loadStats]);

  // H5 定时截屏检测
  const tickH5 = useCallback(async () => {
    if (liveStopFlagRef.current) return;
    if (liveDetecting) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < 2) {
      // 还没准备好，稍后重试
      if (!liveStopFlagRef.current) {
        liveTimerRef.current = setTimeout(tickH5, 1500);
      }
      return;
    }

    setLiveDetecting(true);
    try {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) throw new Error('no 2d context');
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.85);
      });
      const det = await runOneDetectionH5(blob);
      applyDetection(det);
    } catch (e) {
      console.warn('[Live H5] tick failed:', e);
    } finally {
      setLiveDetecting(false);
      if (!liveStopFlagRef.current) {
        liveTimerRef.current = setTimeout(tickH5, 4000);
      }
    }
  }, [liveDetecting, runOneDetectionH5, applyDetection]);

  // 支付宝小程序定时拍照检测
  const tickAlipay = useCallback(async () => {
    if (liveStopFlagRef.current) return;
    if (liveDetecting) return;
    const ctx = cameraCtxRef.current;
    if (!ctx) return;

    setLiveDetecting(true);
    try {
      const photo: any = await new Promise((resolve, reject) => {
        ctx.takePhoto({
          quality: 'compressed',
          success: (r: any) => resolve(r),
          fail: (e: any) => reject(e)
        });
      });
      const tmpPath = photo?.tempImagePath || photo?.tempThumbPath;
      if (!tmpPath) throw new Error('no photo path');
      const det = await runOneDetection(tmpPath);
      applyDetection(det);
    } catch (e) {
      console.warn('[Live Alipay] tick failed:', e);
    } finally {
      setLiveDetecting(false);
      if (!liveStopFlagRef.current) {
        liveTimerRef.current = setTimeout(tickAlipay, 4000);
      }
    }
  }, [liveDetecting, runOneDetection, applyDetection]);

  // ===== RK3568 远程视频流 =====
  // 后端每收到一帧 MQTT 图像就沉淀为最新帧，小程序轮询 /api/stream/latest 显示
  const refreshStreamFrame = useCallback(() => {
    setStreamUrl(`${BASE_URL}/api/stream/latest?t=${Date.now()}`);
  }, []);

  const pollStreamInfo = useCallback(async () => {
    try {
      const res = await Taro.request({
        url: `${BASE_URL}/api/stream/info`,
        method: 'GET',
        header: { 'Authorization': `Bearer ${Taro.getStorageSync('factory_token') || ''}` }
      });
      if (res.statusCode === 200 && res.data?.status === 'ok') {
        setStreamInfo(res.data.data);
        const age = res.data.data?.frameAgeSeconds;
        if (typeof age === 'number') {
          streamFrameAgeRef.current = age;
          if (age <= 15) streamStaleNotifiedRef.current = false;
        }
      }
    } catch { /* ignore */ }
  }, []);

  // 远程流定时检测：每 4 秒拉取当前最新帧送 YOLO 检测（防重入）。
  // 帧龄 >15s（硬件 3 秒一帧，正常不会超过）说明后端没收到新帧，
  // 此时 latest 是旧图（服务重启恢复的历史帧或断流残留）——跳过送检，
  // 避免旧图被反复检测入库，看起来像"实时检测正常"的假象
  const tickStream = useCallback(async () => {
    if (liveStopFlagRef.current) return;
    if (streamDetectingRef.current) return;
    if (streamFrameAgeRef.current > 15) {
      if (!streamStaleNotifiedRef.current) {
        streamStaleNotifiedRef.current = true;
        Taro.showToast({ title: '后端未收到硬件新帧，已暂停检测（显示旧画面）', icon: 'none', duration: 2500 });
      }
      if (!liveStopFlagRef.current && autoDetectRef.current) {
        liveTimerRef.current = setTimeout(tickStream, 4000);
      }
      return;
    }
    streamDetectingRef.current = true;
    setLiveDetecting(true);
    try {
      const dl: any = await new Promise((resolve, reject) => {
        Taro.downloadFile({
          url: `${BASE_URL}/api/stream/latest?t=${Date.now()}`,
          success: (r) => resolve(r),
          fail: (e) => reject(e)
        });
      });
      if (dl.statusCode === 200 && dl.tempFilePath) {
        const det = await runOneDetection(dl.tempFilePath, 'rk3568_stream');
        applyDetection(det);
      }
    } catch (e) {
      console.warn('[Stream] tick failed:', e);
    } finally {
      streamDetectingRef.current = false;
      setLiveDetecting(false);
      // 检测耗时可能超过 4 秒，从本轮结束时再排下一轮，保证间隔
      if (!liveStopFlagRef.current && autoDetectRef.current) {
        liveTimerRef.current = setTimeout(tickStream, 4000);
      }
    }
  }, [runOneDetection, applyDetection]);

  const startStreamMonitor = useCallback(() => {
    refreshStreamFrame();
    pollStreamInfo();
    // 画面轮询：每 1 秒换时间戳强制重新拉帧，实现准实时画面
    streamPollRef.current = setInterval(() => {
      refreshStreamFrame();
    }, 1000);
    // 流状态查询：每 3 秒
    const infoTimer = setInterval(pollStreamInfo, 3000);
    (streamPollRef as any)._infoTimer = infoTimer;
    // 定时检测：开关开启时启动
    if (autoDetectRef.current) {
      liveTimerRef.current = setTimeout(tickStream, 2000);
    }
    Taro.showToast({ title: '已连接 RK3568 视频流', icon: 'none', duration: 1500 });
  }, [refreshStreamFrame, pollStreamInfo, tickStream]);

  const stopStreamMonitor = useCallback(() => {
    if (streamPollRef.current) {
      clearInterval(streamPollRef.current);
      const infoTimer = (streamPollRef as any)._infoTimer;
      if (infoTimer) clearInterval(infoTimer);
      (streamPollRef as any)._infoTimer = null;
      streamPollRef.current = null;
    }
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    streamDetectingRef.current = false;
    setLiveDetecting(false);
    setStreamUrl('');
  }, []);

  const stopLiveMonitor = useCallback(() => {
    liveStopFlagRef.current = true;
    stopStreamMonitor();
    // H5：关闭摄像头流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setLiveMode(false);
  }, [stopStreamMonitor]);

  const startLiveMonitor = useCallback((source: 'local' | 'stream' = 'local') => {
    if (liveMode) stopLiveMonitor();
    liveStopFlagRef.current = false;
    setLiveAlertCount(0);
    setLiveLastResult(null);
    setLiveSource(source);
    setLiveMode(true);

    if (source === 'stream') {
      setLivePlatform('alipay');
      // 等一拍让 UI 渲染出 Image 容器
      setTimeout(() => startStreamMonitor(), 100);
      return;
    }

    const isH5 = process.env.TARO_ENV === 'h5';
    setLivePlatform(isH5 ? 'h5' : 'alipay');

    if (isH5) {
      // H5：用电脑摄像头 getUserMedia
      setTimeout(async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('浏览器不支持 getUserMedia');
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: false
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
          }
          Taro.showToast({ title: '电脑摄像头已开启', icon: 'success', duration: 1500 });
          liveTimerRef.current = setTimeout(tickH5, 2500);
        } catch (e: any) {
          console.error('[Live H5] getUserMedia failed:', e);
          Taro.showToast({ title: `无法打开摄像头：${e?.message || e}`, icon: 'none', duration: 3000 });
          setLiveMode(false);
        }
      }, 500);
    } else {
      // 支付宝小程序：用 Camera 组件 + createCameraContext
      setTimeout(() => {
        try {
          cameraCtxRef.current = Taro.createCameraContext();
          Taro.showToast({ title: '手机摄像头已开启', icon: 'success', duration: 1500 });
          liveTimerRef.current = setTimeout(tickAlipay, 2000);
        } catch (e) {
          console.error('[Live Alipay] createCameraContext failed:', e);
          Taro.showToast({ title: '无法打开手机摄像头，请用拍照检测', icon: 'none', duration: 3000 });
          setLiveMode(false);
        }
      }, 800);
    }
  }, [liveMode, tickH5, tickAlipay, startStreamMonitor, stopLiveMonitor]);

  // 页面隐藏时停止监控，避免后台占用摄像头
  useDidHide(() => {
    if (liveMode) stopLiveMonitor();
  });

  useEffect(() => {
    return () => {
      liveStopFlagRef.current = true;
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      if (streamPollRef.current) {
        clearInterval(streamPollRef.current);
        const infoTimer = (streamPollRef as any)._infoTimer;
        if (infoTimer) clearInterval(infoTimer);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleChooseImage = useCallback(async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      });
      const path = res.tempFilePaths[0];
      setImagePath(path);
      setResult(null);
    } catch (err: any) {
      // 忽略用户主动取消操作的错误 (errorCode: 11)
      if (err?.errMsg && String(err.errMsg).indexOf('cancel') === -1) {
        console.error('[Detect] chooseImage error:', err);
      }
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImagePath('');
    setResult(null);
  }, []);

  const handleDetect = useCallback(async () => {
    if (!imagePath) {
      Taro.showToast({ title: '请先拍照或选择图片', icon: 'none' });
      return;
    }

    setDetecting(true);
    setResult(null);

    try {
      // 所有平台统一使用 uploadFile 上传真实图片
      const uploadRes = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
        Taro.uploadFile({
          url: `${BASE_URL}/api/detections/detect`,
          filePath: imagePath,
          name: 'image',
          formData: {
            deviceId: 'mp_user',
            camera: 'mobile'
          },
          header: {
            'Authorization': `Bearer ${Taro.getStorageSync('factory_token') || ''}`
          },
          success: (r) => resolve({ statusCode: r.statusCode, data: r.data }),
          fail: (e) => reject(e)
        });
      });

      if (uploadRes.statusCode === 200) {
        try {
          const parsed = JSON.parse(uploadRes.data);
          if (parsed.status === 'ok') {
            const d = parsed.data;
            setResult({
              ...d,
              annotatedImage: d.annotated_image
            });
            loadStats();
            loadRecords();
            // 未戴安全帽时震动警告
            if (d.summary?.no_helmet > 0) {
              Taro.vibrateShort({ type: 'medium' });
              Taro.showToast({ title: `检测到${d.summary.no_helmet}人未戴安全帽！`, icon: 'none', duration: 2500 });
            } else {
              Taro.showToast({ title: '检测完成', icon: 'success' });
            }
          } else {
            setResult({ persons: [], summary: { total_persons: 0, compliant: 0, no_helmet: 0, unknown: 0 }, error: parsed.message });
            Taro.showToast({ title: parsed.message || '检测失败', icon: 'none' });
          }
        } catch {
          setResult({ persons: [], summary: { total_persons: 0, compliant: 0, no_helmet: 0, unknown: 0 }, error: '响应解析失败' });
        }
      } else {
        setResult({ persons: [], summary: { total_persons: 0, compliant: 0, no_helmet: 0, unknown: 0 }, error: `HTTP ${uploadRes.statusCode}` });
      }
    } catch (err) {
      console.error('[Detect] detect error:', err);
      setResult({
        persons: [],
        summary: { total_persons: 0, compliant: 0, no_helmet: 0, unknown: 0 },
        error: '检测服务不可用，请确保 Python 推理服务运行在端口 8001'
      });
    } finally {
      setDetecting(false);
    }
  }, [imagePath]);

  const compliantRate = stats.totalPersons > 0
    ? Math.round((stats.compliant / stats.totalPersons) * 100)
    : 100;

  // 环境分析等级配置
  const envLevelConfig: Record<string, { text: string; color: string; bg: string; icon: string }> = {
    safe: { text: '安全', color: '#00b42a', bg: 'rgba(0, 180, 42, 0.1)', icon: '✅' },
    warning: { text: '预警', color: '#ff7d00', bg: 'rgba(255, 125, 0, 0.1)', icon: '⚠️' },
    danger: { text: '危险', color: '#f53f3f', bg: 'rgba(245, 63, 63, 0.1)', icon: '🔴' },
    critical: { text: '紧急', color: '#f53f3f', bg: 'rgba(245, 63, 63, 0.15)', icon: '🚨' },
    unknown: { text: '未知', color: '#86909c', bg: 'rgba(134, 144, 156, 0.1)', icon: '❓' }
  };

  const itemLevelConfig: Record<string, { color: string; icon: string }> = {
    safe: { color: '#00b42a', icon: '✓' },
    warning: { color: '#ff7d00', icon: '!' },
    danger: { color: '#f53f3f', icon: '!' },
    critical: { color: '#f53f3f', icon: '!' },
    unknown: { color: '#86909c', icon: '?' }
  };

  const actionIconMap: Record<string, string> = {
    fan: '💨',
    buzzer: '📢',
    valve: '🔧',
    light: '💡'
  };

  const suggestionPriorityConfig: Record<string, { label: string; color: string; bg: string }> = {
    high: { label: '紧急', color: '#f53f3f', bg: 'rgba(245, 63, 63, 0.12)' },
    medium: { label: '建议', color: '#ff7d00', bg: 'rgba(255, 125, 0, 0.12)' },
    low: { label: '记录', color: '#86909c', bg: 'rgba(134, 144, 156, 0.12)' }
  };

  const handleGoAlarm = useCallback(() => {
    Taro.switchTab({ url: '/pages/alarm/index' });
  }, []);

  return (
    <View className={styles.page}>
      {/* 顶部统计卡片 */}
      <View className={styles.statsCard}>
        <View className={styles.statsHeader}>
          <Text className={styles.statsTitle}>🤖 AI 安全帽检测</Text>
          <Text className={styles.statsDate}>今日</Text>
        </View>
        <View className={styles.statsRow}>
          <View className={styles.statItem}>
            <Text className={styles.statValue}>{stats.totalDetections}</Text>
            <Text className={styles.statLabel}>检测次数</Text>
          </View>
          <View className={styles.statDivider} />
          <View className={styles.statItem}>
            <Text className={styles.statValue}>{stats.totalPersons}</Text>
            <Text className={styles.statLabel}>检测人数</Text>
          </View>
          <View className={styles.statDivider} />
          <View className={styles.statItem}>
            <Text className={classnames(styles.statValue, stats.noHelmet > 0 && styles.danger)}>
              {stats.noHelmet}
            </Text>
            <Text className={styles.statLabel}>未戴安全帽</Text>
          </View>
        </View>
        <View className={styles.progressBar}>
          <View className={styles.progressFill} style={{ width: `${compliantRate}%` }} />
        </View>
        <Text className={styles.compliantRate}>合规率 {compliantRate}%</Text>
      </View>

      {/* 环境安全智能分析卡片 */}
      <View className={styles.envCard}>
        <View className={styles.envHeader}>
          <View className={styles.envTitleWrap}>
            <Text className={styles.envIcon}>🔍</Text>
            <Text className={styles.envTitle}>环境安全智能分析</Text>
          </View>
          <View
            className={classnames(styles.envLevelBadge, envAnalysis && envLevelConfig[envAnalysis.level])}
            style={envAnalysis ? {
              color: envLevelConfig[envAnalysis.level].color,
              background: envLevelConfig[envAnalysis.level].bg
            } : undefined}
          >
            <Text>{envAnalysis ? envLevelConfig[envAnalysis.level].icon : ''}</Text>
            <Text>{envAnalysis ? envLevelConfig[envAnalysis.level].text : '加载中'}</Text>
          </View>
        </View>

        {envAnalyzing ? (
          <View className={styles.envLoading}>
            <Text>正在分析传感器数据...</Text>
          </View>
        ) : envAnalysis ? (
          <>
            {/* 安全评分 + 消息 */}
            <View className={styles.envScoreRow}>
              <View className={styles.envScoreWrap}>
                <Text className={styles.envScoreValue}>{envAnalysis.score}</Text>
                <Text className={styles.envScoreUnit}>分</Text>
              </View>
              <Text className={styles.envMessage}>{envAnalysis.message}</Text>
            </View>

            {/* 各传感器状态 */}
            {envAnalysis.items.length > 0 && (
              <View className={styles.envItems}>
                {envAnalysis.items.map((item) => {
                  const cfg = itemLevelConfig[item.level] || itemLevelConfig.unknown;
                  return (
                    <View key={item.key} className={styles.envItem}>
                      <View className={styles.envItemLeft}>
                        <View
                          className={styles.envItemDot}
                          style={{ background: cfg.color }}
                        />
                        <View className={styles.envItemInfo}>
                          <Text className={styles.envItemLabel}>{item.label}</Text>
                          <Text className={styles.envItemThreshold}>{item.threshold}</Text>
                        </View>
                      </View>
                      <View className={styles.envItemRight}>
                        <Text className={styles.envItemValue}>{item.value}</Text>
                        <Text className={styles.envItemStatus} style={{ color: cfg.color }}>
                          {item.status}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* 应对措施 */}
            {envAnalysis.actions.length > 0 && (
              <View className={styles.envActions}>
                <Text className={styles.envActionsTitle}>
                  📋 建议应对措施（{envAnalysis.actions.length}项）
                </Text>
                {envAnalysis.actions.map((act, idx) => (
                  <View
                    key={idx}
                    className={classnames(
                      styles.envActionItem,
                      act.priority === 'high' && styles.envActionHigh
                    )}
                  >
                    <Text className={styles.envActionIcon}>
                      {actionIconMap[act.type] || '⚡'}
                    </Text>
                    <View className={styles.envActionContent}>
                      <View className={styles.envActionHeader}>
                        <Text className={styles.envActionDevice}>{act.device}</Text>
                        <Text
                          className={classnames(
                            styles.envActionBadge,
                            act.action === 'on' ? styles.envActionOn : styles.envActionOff
                          )}
                        >
                          {act.action === 'on' ? '开启' : act.action === 'close' ? '关闭' : act.action}
                        </Text>
                        {act.priority === 'high' && (
                          <Text className={styles.envPriorityHigh}>优先</Text>
                        )}
                      </View>
                      <Text className={styles.envActionReason}>{act.reason}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* 已自动执行的联动 */}
            {envAnalysis.executedControls && envAnalysis.executedControls.length > 0 && (
              <View className={styles.envExecuted}>
                <Text className={styles.envExecutedTitle}>
                  ⚡ 已自动执行联动控制（{envAnalysis.executedControls.length}项）
                </Text>
                {envAnalysis.executedControls.map((exe, idx) => (
                  <View key={idx} className={styles.envExecutedItem}>
                    <Text className={styles.envActionIcon}>{actionIconMap[exe.type] || '⚡'}</Text>
                    <Text className={styles.envExecutedText}>
                      {exe.device} → {exe.action === 'on' ? '已开启' : '已关闭'}（{exe.reason}）
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* 自动联动开关 + 刷新 */}
            <View className={styles.envFooter}>
              <View className={styles.envAutoControl}>
                <Text className={styles.envAutoControlLabel}>自动联动控制</Text>
                <Switch
                  checked={autoControl}
                  onChange={handleAutoControlChange}
                  color="#667eea"
                />
              </View>
              <Text className={styles.envRefreshBtn} onClick={() => loadEnvAnalysis(autoControl)}>
                重新分析
              </Text>
            </View>

            {/* 导出报告 */}
            <View className={styles.exportRow}>
              <Text className={styles.exportLabel}>📄 导出分析报告</Text>
              <View className={styles.exportBtns}>
                <Text
                  className={classnames(
                    styles.exportBtn,
                    styles.exportWord,
                    (exporting === 'word') && styles.exporting
                  )}
                  onClick={() => handleExport('word')}
                >
                  {exporting === 'word' ? '生成中...' : 'Word'}
                </Text>
                <Text
                  className={classnames(
                    styles.exportBtn,
                    styles.exportPdf,
                    (exporting === 'pdf') && styles.exporting
                  )}
                  onClick={() => handleExport('pdf')}
                >
                  {exporting === 'pdf' ? '生成中...' : 'PDF'}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View className={styles.envLoading}>
            <Text>暂无分析数据</Text>
          </View>
        )}
      </View>

      {/* 摄像头实时监控 */}
      <View className={styles.section}>
        <View className={styles.sectionHeader}>
          <Text className={styles.sectionTitle}>📹 摄像头实时监控</Text>
          <Switch
            checked={liveMode}
            onChange={(val) => (val ? startLiveMonitor(liveSource) : stopLiveMonitor())}
            color="#1a6dff"
          />
        </View>
        <Text className={styles.sectionDesc}>
          {liveSource === 'stream'
            ? '接入 RK3568 上传的视频流画面，开启「定时检测」后每 4 秒截取当前帧送 AI 识别'
            : '开启后自动调用摄像头每 4 秒识别一次安全帽佩戴情况，发现未戴立即告警'}
        </Text>

        {liveMode && (
          <>
            {/* 视频源切换 */}
            <View className={styles.sourceTabs}>
              <View
                className={classnames(styles.sourceTab, liveSource === 'local' && styles.sourceTabActive)}
                onClick={() => liveSource !== 'local' && startLiveMonitor('local')}
              >
                <Text>📱 本机相机</Text>
              </View>
              <View
                className={classnames(styles.sourceTab, liveSource === 'stream' && styles.sourceTabActive)}
                onClick={() => liveSource !== 'stream' && startLiveMonitor('stream')}
              >
                <Text>📡 RK3568 视频流</Text>
              </View>
            </View>

            <View className={styles.cameraWrap}>
              {liveSource === 'stream' ? (
                <>
                  {/* RK3568 远程流：轮询最新帧 */}
                  {streamUrl ? (
                    <Image className={styles.camera} src={streamUrl} mode="aspectFill" />
                  ) : (
                    <View className={styles.streamPlaceholder}>
                      <Text className={styles.streamPlaceholderIcon}>📡</Text>
                      <Text className={styles.streamPlaceholderText}>
                        {streamInfo && !streamInfo.available
                          ? '等待 RK3568 上传画面...'
                          : '正在连接视频流...'}
                      </Text>
                    </View>
                  )}
                  {streamInfo && streamInfo.available && (
                    <View className={styles.streamMeta}>
                      <Text className={styles.streamMetaText}>
                        {streamInfo.deviceId || 'RK3568'} · 帧 {streamInfo.timestamp || '--'}
                        {streamInfo.frameAgeSeconds != null && streamInfo.frameAgeSeconds > 15
                          ? ` · ⚠ 帧已停更${streamInfo.frameAgeSeconds > 3600
                              ? `${Math.floor(streamInfo.frameAgeSeconds / 3600)}小时`
                              : streamInfo.frameAgeSeconds > 60
                                ? `${Math.floor(streamInfo.frameAgeSeconds / 60)}分钟`
                                : `${streamInfo.frameAgeSeconds}秒`}（非实时画面）`
                          : ''}
                      </Text>
                    </View>
                  )}
                </>
              ) : livePlatform === 'h5' ? (
                <>
                  {/* H5：电脑摄像头，用原生 video 元素 */}
                  <video
                    ref={videoRef}
                    className={styles.camera}
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </>
              ) : (
                /* 支付宝小程序：手机自带摄像头 Camera 组件 */
                <Camera
                  className={styles.camera}
                  mode="normal"
                  flash="off"
                  devicePosition="back"
                  onError={(e) => {
                    console.error('[Camera] error:', e);
                    Taro.showToast({ title: '摄像头打开失败', icon: 'none' });
                    stopLiveMonitor();
                  }}
                />
              )}
              {liveDetecting && (
                <View className={styles.cameraMask}>
                  <Text className={styles.cameraMaskText}>🔍 AI 识别中...</Text>
                </View>
              )}
              {liveAlertCount > 0 && (
                <View className={styles.liveAlertBadge}>
                  <Text>🚨 已告警 {liveAlertCount} 次</Text>
                </View>
              )}
            </View>

            {/* 远程流定时检测开关 */}
            {liveSource === 'stream' && (
              <View className={styles.autoDetectRow}>
                <View className={styles.autoDetectInfo}>
                  <Text className={styles.autoDetectLabel}>⏱ 定时检测（每 4 秒）</Text>
                  <Text className={styles.autoDetectDesc}>
                    {autoDetectOn ? '开启中：自动截取最新画面送 AI 识别' : '已关闭：仅观看画面'}
                  </Text>
                </View>
                <Switch
                  checked={autoDetectOn}
                  onChange={(val) => {
                    setAutoDetectOn(val);
                    autoDetectRef.current = val;
                    if (val && !liveTimerRef.current && !streamDetectingRef.current) {
                      liveTimerRef.current = setTimeout(tickStream, 500);
                    }
                    if (!val && liveTimerRef.current) {
                      clearTimeout(liveTimerRef.current);
                      liveTimerRef.current = null;
                    }
                  }}
                  color="#1a6dff"
                />
              </View>
            )}

            {/* 实时检测结果 */}
            {liveLastResult && (
              <View className={styles.liveResult}>
                {liveLastResult.annotatedImage && (
              <View className={styles.annotatedImageWrap}>
                <Image
                  className={styles.annotatedImage}
                  src={`data:image/jpeg;base64,${liveLastResult.annotatedImage}`}
                  mode="widthFix"
                />
                <Text className={styles.annotatedHint}>最新一帧 AI 标注</Text>
              </View>
            )}
                <View className={styles.resultSummary}>
                  <View className={styles.resultItem}>
                    <Text className={styles.resultIcon}>👥</Text>
                    <Text className={styles.resultValue}>{liveLastResult.summary.total_persons}</Text>
                    <Text className={styles.resultLabel}>总人数</Text>
                  </View>
                  <View className={styles.resultItem}>
                    <Text className={styles.resultIcon}>🪖</Text>
                    <Text className={classnames(styles.resultValue, styles.compliant)}>
                      {liveLastResult.summary.compliant}
                    </Text>
                    <Text className={styles.resultLabel}>合规</Text>
                  </View>
                  <View className={styles.resultItem}>
                    <Text className={styles.resultIcon}>🚫</Text>
                    <Text className={classnames(styles.resultValue, styles.danger)}>
                      {liveLastResult.summary.no_helmet}
                    </Text>
                    <Text className={styles.resultLabel}>未戴</Text>
                  </View>
                </View>
                {liveLastResult.summary.no_helmet > 0 && liveLastResult.suggestions && (
                  <View className={styles.suggestionBox}>
                    <Text className={styles.alertMessage}>
                      🚨 检测到 {liveLastResult.summary.no_helmet} 人未佩戴安全帽，已生成告警
                    </Text>
                    {liveLastResult.suggestions.slice(0, 2).map((s, idx) => (
                      <View key={idx} className={styles.suggestionItem}>
                        <Text className={styles.suggestionText}>• {s.text}</Text>
                      </View>
                    ))}
                    <View className={styles.suggestionFooter} onClick={handleGoAlarm}>
                      <Text className={styles.suggestionFooterText}>查看告警详情 ›</Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>

      {/* 拍照上传区 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>上传照片检测</Text>
        <Text className={styles.sectionDesc}>拍摄或选择一张工厂工作场景照片，AI 将自动识别人员安全帽佩戴情况</Text>

        {imagePath ? (
          <View className={styles.pickedImageWrap}>
            <Image className={styles.pickedImage} src={imagePath} mode="aspectFill" />
            <View className={styles.removeBtn} onClick={handleRemoveImage}>
              <Text>×</Text>
            </View>
          </View>
        ) : (
          <View className={styles.imagePicker} onClick={handleChooseImage}>
            <Text className={styles.pickIcon}>📸</Text>
            <Text className={styles.pickText}>点击拍照或从相册选择</Text>
          </View>
        )}

        <Button
          className={classnames(styles.detectBtn, (!imagePath || detecting) && styles.disabled)}
          onClick={handleDetect}
          disabled={!imagePath || detecting}
          loading={detecting}
        >
          {detecting ? 'AI 检测中...' : '🤖 开始 AI 检测'}
        </Button>
      </View>

      {/* 检测结果 */}
      {result && (
        <View className={styles.resultSection}>
          <Text className={styles.sectionTitle}>检测结果</Text>

          {/* 标注图 */}
          {result.annotatedImage && (
            <View className={styles.annotatedImageWrap}>
              <Image
                className={styles.annotatedImage}
                src={`data:image/jpeg;base64,${result.annotatedImage}`}
                mode="widthFix"
              />
              <Text className={styles.annotatedHint}>AI 标注结果（绿框=已戴 红框=未戴）</Text>
            </View>
          )}

          {result.error ? (
            <View className={styles.errorBox}>
              <Text className={styles.errorIcon}>⚠️</Text>
              <Text className={styles.errorText}>{result.error}</Text>
              <Text className={styles.errorHint}>检测服务可能未启动，请确保 Python 推理服务运行在端口 8001</Text>
            </View>
          ) : (
            <>
              <View className={styles.resultSummary}>
                <View className={styles.resultItem}>
                  <Text className={styles.resultIcon}>👥</Text>
                  <Text className={styles.resultValue}>{result.summary.total_persons}</Text>
                  <Text className={styles.resultLabel}>总人数</Text>
                </View>
                <View className={styles.resultItem}>
                  <Text className={styles.resultIcon}>🪖</Text>
                  <Text className={classnames(styles.resultValue, styles.compliant)}>
                    {result.summary.compliant}
                  </Text>
                  <Text className={styles.resultLabel}>合规</Text>
                </View>
                <View className={styles.resultItem}>
                  <Text className={styles.resultIcon}>🚫</Text>
                  <Text className={classnames(styles.resultValue, styles.danger)}>
                    {result.summary.no_helmet}
                  </Text>
                  <Text className={styles.resultLabel}>未戴安全帽</Text>
                </View>
              </View>

              {result.persons && result.persons.length > 0 && (
                <View className={styles.personList}>
                  {result.persons.map((p, idx) => (
                    <View
                      key={idx}
                      className={classnames(
                        styles.personItem,
                        p.status === 'no_helmet' && styles.noHelmet
                      )}
                    >
                      <Text className={styles.personIdx}>#{idx + 1}</Text>
                      <Text className={styles.personStatus}>
                        {p.status === 'compliant' ? '✅ 已戴安全帽' : '❌ 未戴安全帽'}
                      </Text>
                      <Text className={styles.personConf}>置信度 {(p.confidence * 100).toFixed(1)}%</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 告警提示 + 处置建议 */}
              {result.suggestions && result.suggestions.length > 0 && (
                <View className={styles.suggestionBox}>
                  {result.alertMessage && (
                    <Text className={styles.alertMessage}>🚨 {result.alertMessage}</Text>
                  )}
                  <Text className={styles.suggestionTitle}>
                    📋 AI 处置建议（{result.suggestions.length}项）
                  </Text>
                  {result.suggestions.map((s, idx) => {
                    const cfg = suggestionPriorityConfig[s.priority] || suggestionPriorityConfig.low;
                    return (
                      <View
                        key={idx}
                        className={classnames(
                          styles.suggestionItem,
                          s.priority === 'high' && styles.suggestionHigh
                        )}
                      >
                        <View
                          className={styles.suggestionPriority}
                          style={{ color: cfg.color, background: cfg.bg }}
                        >
                          {cfg.label}
                        </View>
                        <Text className={styles.suggestionText}>{s.text}</Text>
                      </View>
                    );
                  })}
                  <View className={styles.suggestionFooter} onClick={handleGoAlarm}>
                    <Text className={styles.suggestionFooterText}>查看告警详情 ›</Text>
                  </View>
                </View>
              )}

              {result.summary.total_persons === 0 && !result.error && (
                <View className={styles.noResult}>
                  <Text className={styles.noResultIcon}>🔍</Text>
                  <Text className={styles.noResultText}>未检测到人员</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* 历史检测记录 */}
      <View className={styles.section}>
        <View className={styles.sectionHeader}>
          <Text className={styles.sectionTitle}>最近检测</Text>
          <Text className={styles.refreshBtn} onClick={loadRecords}>刷新</Text>
        </View>

        <ScrollView className={styles.recordList} scrollY>
          {records.length === 0 ? (
            <View className={styles.empty}>
              <Text className={styles.emptyIcon}>📋</Text>
              <Text className={styles.emptyText}>暂无检测记录</Text>
            </View>
          ) : (
            records.map((r) => (
              <View key={r.id} className={styles.recordItem}>
                <View className={styles.recordLeft}>
                  <Text className={styles.recordTime}>
                    {r.timestamp ? r.timestamp.replace('T', ' ').substring(5, 16) : ''}
                  </Text>
                  <Text className={styles.recordDevice}>{r.deviceId || 'mp_user'}</Text>
                </View>
                <View className={styles.recordRight}>
                  <Text className={styles.recordTotal}>{r.total || 0}人</Text>
                  {r.noHelmet > 0 ? (
                    <Text className={styles.recordDanger}>{r.noHelmet}人未戴</Text>
                  ) : (
                    <Text className={styles.recordOK}>全部合规</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
};

export default DetectPage;
