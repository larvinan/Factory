import { View, Text, Textarea, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
  getInspectionTaskDetail,
  getInspectionPoints,
  checkinPoint,
  startInspectionTask,
  completeInspectionTask,
  cancelInspectionTask
} from '@/services/api'
import styles from './detail.module.scss'

definePageConfig({
  navigationBarTitleText: '巡检任务详情'
})

type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'

interface InspectionItem {
  id?: number | string
  name: string
  checked?: boolean
  required?: boolean
}

interface CheckinPoint {
  id: number
  code: string
  name: string
  location?: string
  required: boolean
  sortOrder: number
  checkedIn: boolean
  checkinTime?: string
  inspectorName?: string
}

interface TaskDetail {
  id: number | string
  title: string
  description?: string
  workshopName: string
  inspectorName?: string
  status: TaskStatus
  priority: TaskPriority
  scheduledDate: string
  dueDate: string
  itemsJson?: string
  resultNote?: string
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; cls: string }> = {
  pending: { label: '待分配', cls: 'status-pending' },
  assigned: { label: '待巡检', cls: 'status-assigned' },
  in_progress: { label: '进行中', cls: 'status-in-progress' },
  completed: { label: '已完成', cls: 'status-completed' },
  cancelled: { label: '已取消', cls: 'status-cancelled' }
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; cls: string }> = {
  urgent: { label: '紧急', cls: 'tag-urgent' },
  high: { label: '高', cls: 'tag-high' },
  normal: { label: '中', cls: 'tag-normal' },
  low: { label: '低', cls: 'tag-low' }
}

export default function InspectionDetail() {
  const router = useRouter()
  const { id } = router.params
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [items, setItems] = useState<InspectionItem[]>([])
  const [points, setPoints] = useState<CheckinPoint[]>([])
  const [pointsProgress, setPointsProgress] = useState({
    requiredTotal: 0,
    requiredChecked: 0,
    allChecked: false,
    totalPoints: 0,
    totalChecked: 0
  })
  const [remark, setRemark] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)

  useEffect(() => {
    if (id) {
      loadDetail()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadDetail = async () => {
    setLoading(true)
    try {
      const res = await getInspectionTaskDetail(id)
      const detail = res as TaskDetail
      setTask(detail)
      let parsedItems: InspectionItem[] = []
      try {
        parsedItems = JSON.parse(detail.itemsJson || '[]')
        if (!Array.isArray(parsedItems)) parsedItems = []
      } catch (e) {
        parsedItems = []
      }
      setItems(parsedItems)
      // 加载点位
      await loadPoints()
    } catch (e) {
      console.error('加载详情失败', e)
      Taro.showToast({ title: '加载详情失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const loadPoints = async () => {
    try {
      const res = await getInspectionPoints(Number(id))
      const data = res as any
      setPoints(data.points || [])
      setPointsProgress({
        requiredTotal: data.requiredTotal || 0,
        requiredChecked: data.requiredChecked || 0,
        allChecked: data.allChecked || false,
        totalPoints: data.totalPoints || 0,
        totalChecked: data.totalChecked || 0
      })
    } catch (e) {
      console.error('加载点位失败', e)
    }
  }

  const showMessage = (message: string, type: 'success' | 'error' = 'success') => {
    Taro.showToast({ title: message, icon: type === 'error' ? 'none' : 'success' })
  }

  const handleScan = async () => {
    if (submitting) return
    // H5 环境不支持扫码，改用 ActionSheet 选择点位模拟打卡
    const unchecked = points.filter(p => !p.checkedIn)
    if (unchecked.length === 0) {
      showMessage('所有点位已打卡', 'error')
      return
    }
    // 真机小程序环境：调起扫码
    // H5 环境：弹出 ActionSheet 让用户选择点位
    const isH5 = typeof window !== 'undefined' && window.location
    if (isH5) {
      try {
        const { tapIndex } = await Taro.showActionSheet({
          itemList: unchecked.map(p => `${p.name} (${p.code})`),
          itemColor: '#333'
        })
        const selected = unchecked[tapIndex]
        await doCheckin(selected.id, selected.name)
      } catch (e: any) {
        // 用户取消选择
      }
    } else {
      // 真机扫码
      setSubmitting(true)
      try {
        const scanRes = await Taro.scanCode({ onlyFromCamera: false, scanType: ['qrCode'] })
        const qrText = scanRes.result
        let qrData: any = null
        try {
          qrData = JSON.parse(qrText)
        } catch {
          qrData = { code: qrText }
        }
        const res = await checkinPoint(Number(id), {
          pointId: qrData.pointId,
          code: qrData.code
        })
        const data = res as any
        if (data.autoCompleted) {
          showMessage('全部点位已打卡，巡检任务已自动完成！')
        } else {
          showMessage(`打卡成功：${data.pointName}`)
        }
        await loadPoints()
        await loadDetail()
      } catch (e: any) {
        if (e?.errMsg?.includes('cancel') || e?.errMsg?.includes('auth deny')) {
          // 用户取消扫码
        } else {
          console.error('扫码打卡失败', e)
          showMessage('扫码打卡失败', 'error')
        }
      } finally {
        setSubmitting(false)
      }
    }
  }

  // 执行打卡（H5 ActionSheet 和手动点击共用）
  const doCheckin = async (pointId: number, pointName: string) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await checkinPoint(Number(id), { pointId })
      const data = res as any
      if (data.autoCompleted) {
        showMessage('全部点位已打卡，巡检任务已自动完成！')
      } else {
        showMessage(`打卡成功：${pointName}`)
      }
      await loadPoints()
      await loadDetail()
    } catch (e) {
      console.error('打卡失败', e)
      const errMsg = (e as any)?.message || '打卡失败'
      showMessage(errMsg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // H5 预览用：手动点击点位打卡（复用 doCheckin）
  const handleManualCheckin = (pointId: number, pointName: string) => {
    doCheckin(pointId, pointName)
  }

  const handleStart = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await startInspectionTask(id)
      showMessage('已开始巡检')
      await loadDetail()
    } catch (e) {
      console.error('开始巡检失败', e)
      showMessage('操作失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleComplete = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      // 后端读取 resultNote 字段，字段名错误会导致备注存为 null
      await completeInspectionTask(id, { resultNote: remark })
      showMessage('巡检已完成')
      await loadDetail()
    } catch (e) {
      console.error('完成巡检失败', e)
      showMessage('操作失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await cancelInspectionTask(id)
      showMessage('已取消任务')
      await loadDetail()
    } catch (e) {
      console.error('取消任务失败', e)
      showMessage('操作失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const canCheckin = task?.status === 'in_progress' || task?.status === 'assigned'
  const progressPercent = pointsProgress.requiredTotal > 0
    ? Math.round((pointsProgress.requiredChecked / pointsProgress.requiredTotal) * 100)
    : 0

  const renderInfo = () => {
    if (!task) return null
    const statusCfg = STATUS_CONFIG[task.status]
    const priorityCfg = PRIORITY_CONFIG[task.priority]
    return (
      <View className={styles.infoCard}>
        <View className={styles.infoHeader}>
          <Text className={styles.infoTitle}>{task.title}</Text>
          <Text className={`${styles.statusTag} ${styles[statusCfg.cls]}`}>
            {statusCfg.label}
          </Text>
        </View>
        {task.description ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>描述</Text>
            <Text className={styles.infoValue}>{task.description}</Text>
          </View>
        ) : null}
        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>车间</Text>
          <Text className={styles.infoValue}>{task.workshopName}</Text>
        </View>
        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>巡检人</Text>
          <Text className={styles.infoValue}>{task.inspectorName || '未分配'}</Text>
        </View>
        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>优先级</Text>
          <View>
            <Text className={`${styles.priorityTag} ${styles[priorityCfg.cls]}`}>
              {priorityCfg.label}
            </Text>
          </View>
        </View>
        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>计划日期</Text>
          <Text className={styles.infoValue}>{task.scheduledDate}</Text>
        </View>
        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>截止日期</Text>
          <Text className={styles.infoValue}>{task.dueDate}</Text>
        </View>
        {task.resultNote ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>结果备注</Text>
            <Text className={styles.infoValue}>{task.resultNote}</Text>
          </View>
        ) : null}
      </View>
    )
  }

  const renderPoints = () => {
    if (points.length === 0) return null
    return (
      <View className={styles.pointsCard}>
        <View className={styles.sectionHeader}>
          <Text className={styles.sectionTitleText}>巡检点位打卡</Text>
          <Text className={styles.progressText}>
            {pointsProgress.requiredChecked}/{pointsProgress.requiredTotal} 必检
          </Text>
        </View>

        {/* 进度条 */}
        <View className={styles.progressBar}>
          <View className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
        </View>

        {/* 扫码打卡按钮 */}
        {canCheckin ? (
          <View className={styles.scanBtn} onClick={handleScan}>
            <Text className={styles.scanIcon}>📷</Text>
            <Text className={styles.scanBtnText}>扫码打卡</Text>
          </View>
        ) : null}

        {/* 点位列表 */}
        <View className={styles.pointList}>
          {points.map((p) => (
            <View
              key={p.id}
              className={`${styles.pointItem} ${p.checkedIn ? styles.pointChecked : ''} ${!p.required ? styles.pointOptional : ''}`}
              onClick={() => {
                if (canCheckin && !p.checkedIn) {
                  handleManualCheckin(p.id, p.name)
                }
              }}
            >
              <View className={`${styles.pointCheckbox} ${p.checkedIn ? styles.pointCheckboxDone : ''}`}>
                {p.checkedIn ? <Text className={styles.checkIcon}>✓</Text> : null}
              </View>
              <View className={styles.pointInfo}>
                <View className={styles.pointNameRow}>
                  <Text className={styles.pointName}>{p.name}</Text>
                  {p.required ? (
                    <Text className={styles.pointRequired}>必检</Text>
                  ) : (
                    <Text className={styles.pointOptionalTag}>选检</Text>
                  )}
                </View>
                <Text className={styles.pointCode}>{p.code}</Text>
                {p.location ? (
                  <Text className={styles.pointLocation}>📍 {p.location}</Text>
                ) : null}
                {p.checkedIn && p.checkinTime ? (
                  <Text className={styles.checkinTime}>
                    ✅ 已打卡 {p.inspectorName ? `· ${p.inspectorName}` : ''}
                  </Text>
                ) : canCheckin ? (
                  <Text className={styles.tapToCheckin}>点击模拟打卡</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    )
  }

  const renderItems = () => {
    if (items.length === 0) return null
    return (
      <View className={styles.itemsCard}>
        <View className={styles.sectionHeader}>
          <Text className={styles.sectionTitleText}>巡检项清单</Text>
        </View>
        {items.map((item, idx) => {
          const checked = !!item.checked
          const key = item.id !== undefined ? item.id : idx
          return (
            <View key={key} className={styles.itemRow}>
              <View className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>
                {checked ? <Text className={styles.checkIcon}>✓</Text> : null}
              </View>
              <Text className={styles.itemName}>{item.name}</Text>
              {item.required ? <Text className={styles.requiredMark}>*</Text> : null}
            </View>
          )
        })}
      </View>
    )
  }

  const renderActions = () => {
    if (!task) return null
    const { status } = task
    return (
      <View className={styles.actionBar}>
        {status === 'pending' ? (
          <>
            <View className={styles.secondaryBtn} onClick={handleCancel}>
              <Text className={styles.secondaryBtnText}>取消</Text>
            </View>
            <View className={styles.primaryBtn} onClick={handleStart}>
              <Text className={styles.primaryBtnText}>开始巡检</Text>
            </View>
          </>
        ) : null}
        {status === 'assigned' ? (
          <View className={styles.primaryBtnFull} onClick={handleStart}>
            <Text className={styles.primaryBtnText}>开始巡检</Text>
          </View>
        ) : null}
        {status === 'in_progress' ? (
          <View className={styles.inProgressActions}>
            <View className={styles.remarkInput}>
              <Textarea
                className={styles.textarea}
                value={remark}
                onInput={(e) => setRemark(e.detail.value)}
                placeholder="填写巡检结果备注（选填）"
                maxlength={500}
              />
            </View>
            <View className={styles.primaryBtnFull} onClick={handleComplete}>
              <Text className={styles.primaryBtnText}>完成巡检</Text>
            </View>
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <ScrollView scrollY className={styles.page} enhanced bounces showScrollbar={false}>
      {loading && !task ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>加载中...</Text>
        </View>
      ) : !task ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>未找到任务</Text>
        </View>
      ) : (
        <>
          {renderInfo()}
          {renderPoints()}
          {renderItems()}
        </>
      )}
      {renderActions()}
    </ScrollView>
  )
}
