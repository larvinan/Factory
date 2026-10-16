import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { getInspectionTasks, getInspectionStats } from '@/services/api'
import styles from './index.module.scss'

definePageConfig({
  navigationBarTitleText: '巡检任务'
})

type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'

interface InspectionTask {
  id: number | string
  title: string
  workshopName: string
  inspectorName?: string
  status: TaskStatus
  priority: TaskPriority
  plannedDate: string
  deadline: string
}

interface InspectionStats {
  pending: number
  assigned: number
  in_progress: number
  completed: number
  dueToday: number
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

const FILTER_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待分配' },
  { key: 'assigned', label: '待巡检' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' }
]

const STATS_LIST: Array<{ key: keyof InspectionStats; label: string }> = [
  { key: 'pending', label: '待分配' },
  { key: 'assigned', label: '待巡检' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'dueToday', label: '今日到期' }
]

export default function InspectionList() {
  const [tasks, setTasks] = useState<InspectionTask[]>([])
  const [stats, setStats] = useState<InspectionStats>({
    pending: 0,
    assigned: 0,
    in_progress: 0,
    completed: 0,
    dueToday: 0
  })
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter])

  const loadData = async () => {
    setLoading(true)
    try {
      const params = activeFilter === 'all' ? {} : { status: activeFilter }
      const [statsRes, tasksRes] = await Promise.all([
        getInspectionStats(),
        getInspectionTasks(params)
      ])
      setStats(statsRes as InspectionStats)
      setTasks((tasksRes as InspectionTask[]) || [])
    } catch (err) {
      console.error('加载巡检任务失败', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCardClick = (task: InspectionTask) => {
    Taro.navigateTo({ url: `/pages/inspection/detail?id=${task.id}` })
  }

  const renderStatsCard = () => {
    return (
      <View className={styles.statsCard}>
        {STATS_LIST.map(item => (
          <View key={item.key} className={styles.statsItem}>
            <Text className={styles.statsNumber}>{stats[item.key] ?? 0}</Text>
            <Text className={styles.statsLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    )
  }

  const renderFilterBar = () => {
    return (
      <ScrollView scrollX className={styles.filterBar} enhanced showScrollbar={false}>
        {FILTER_TABS.map(tab => (
          <View
            key={tab.key}
            className={`${styles.filterTab} ${activeFilter === tab.key ? styles.filterTabActive : ''}`}
            onClick={() => setActiveFilter(tab.key)}
          >
            <Text className={styles.filterTabText}>{tab.label}</Text>
          </View>
        ))}
      </ScrollView>
    )
  }

  const renderTaskCard = (task: InspectionTask) => {
    const statusCfg = STATUS_CONFIG[task.status]
    const priorityCfg = PRIORITY_CONFIG[task.priority]
    return (
      <View
        key={task.id}
        className={styles.taskCard}
        onClick={() => handleCardClick(task)}
      >
        <View className={`${styles.priorityBar} ${styles[`bar-${task.priority}`]}`} />
        <View className={styles.taskContent}>
          <View className={styles.taskHeader}>
            <Text className={styles.taskTitle}>{task.title}</Text>
            <Text className={`${styles.statusTag} ${styles[statusCfg.cls]}`}>
              {statusCfg.label}
            </Text>
          </View>
          <View className={styles.taskMeta}>
            <Text className={styles.taskMetaText}>车间：{task.workshopName}</Text>
            <Text className={styles.taskMetaText}>
              巡检人：{task.inspectorName || '未分配'}
            </Text>
          </View>
          <View className={styles.taskMeta}>
            <Text className={styles.taskMetaText}>计划日期：{task.scheduledDate ? String(task.scheduledDate).slice(0, 10) : '未排期'}</Text>
            <Text className={styles.taskMetaText}>截止日期：{task.dueDate ? String(task.dueDate).slice(0, 10) : '不限'}</Text>
          </View>
          <View className={styles.taskFooter}>
            <Text className={`${styles.priorityTag} ${styles[priorityCfg.cls]}`}>
              优先级：{priorityCfg.label}
            </Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className={styles.page}>
      {renderStatsCard()}
      {renderFilterBar()}
      <View className={styles.taskList}>
        {loading && tasks.length === 0 ? (
          <View className={styles.empty}>
            <Text className={styles.emptyText}>加载中...</Text>
          </View>
        ) : tasks.length === 0 ? (
          <View className={styles.empty}>
            <Text className={styles.emptyText}>暂无巡检任务</Text>
          </View>
        ) : (
          tasks.map(renderTaskCard)
        )}
      </View>
    </View>
  )
}
