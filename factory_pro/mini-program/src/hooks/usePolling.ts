import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * 轮询 Hook
 * @param fetcher 数据获取函数
 * @param interval 轮询间隔（毫秒），默认 60000ms
 * @param immediate 是否立即执行一次，默认 true
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  interval: number = 60000,
  immediate: boolean = true
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // 始终保持最新的 fetcher，避免闭包陈旧
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const execute = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (!isMountedRef.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err as Error);
      console.error('[Polling] error:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    timerRef.current = setInterval(() => {
      execute();
    }, interval);
  }, [execute, interval, stop]);

  // 手动刷新
  const refresh = useCallback(() => {
    return execute();
  }, [execute]);

  useEffect(() => {
    isMountedRef.current = true;
    if (immediate) {
      execute();
    }
    start();
    return () => {
      isMountedRef.current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  return { data, loading, error, refresh, setData };
}
