// 轻量 fetch 封装，提供 axios 风格的 .get/.post 接口
// 后端：Spring Boot @ 8000 端口，所有接口带 /api 前缀
// hostname 取当前访问地址而非硬编码 localhost：
// 大屏常从局域网其他电脑打开（http://<后端IP>:5173），硬编码会让请求打到访问者自己的机器
export const BASE_URL = `http://${window.location.hostname}:8000/api`

async function request(method, url, data) {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token

  const init = { method, headers }
  if (data && method !== 'GET') init.body = JSON.stringify(data)

  try {
    const res = await fetch(BASE_URL + url, init)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    return Promise.reject(e)
  }
}

export default {
  get: (url) => request('GET', url),
  post: (url, data) => request('POST', url, data),
  put: (url, data) => request('PUT', url, data),
  delete: (url) => request('DELETE', url),
}
