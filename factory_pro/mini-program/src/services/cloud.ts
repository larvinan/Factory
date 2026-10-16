import Taro from '@tarojs/taro'

const isWeapp = process.env.TARO_ENV === 'weapp'

/**
 * 云函数调用（已废弃，改用 HTTP API）
 * 保留此函数用于 H5 环境下的 mock 数据降级
 */
export async function callFunction<T = any>(
  name: string,
  data?: Record<string, any>
): Promise<T> {
  if (!isWeapp) {
    try {
      const mockModule = await import(`../data/${name}`)
      return mockModule.default(data) as T
    } catch {
      throw new Error(`Mock data not found: ${name}`)
    }
  }
  throw new Error('Cloud functions are deprecated, use HTTP API instead')
}

export function getDatabase() {
  return null
}
