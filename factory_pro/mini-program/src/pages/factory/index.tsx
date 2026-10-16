import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import {
  getFactories,
  createFactory,
  updateFactory,
  deleteFactory,
  FactoryInfo,
  FactoryForm
} from '@/services/api';
import { useFactoryStore } from '@/store/factory';
import { useUserStore } from '@/store/user';
import styles from './index.module.scss';

const EMPTY_FORM: FactoryForm = { code: '', name: '', address: '', manager: '', phone: '' };

const FactoryPage: React.FC = () => {
  const { factories, currentFactoryId, setCurrentFactory, loadFactories } = useFactoryStore();
  const { user } = useUserStore();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FactoryForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  useDidShow(() => {
    setLoading(true);
    loadFactories().finally(() => setLoading(false));
  });

  const handleSwitch = useCallback((f: FactoryInfo) => {
    setCurrentFactory(f.id);
    Taro.showToast({ title: `已切换到「${f.name}」`, icon: 'none', duration: 1500 });
  }, [setCurrentFactory]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogVisible(true);
  }, []);

  const openEdit = useCallback((f: FactoryInfo) => {
    setEditingId(f.id);
    setForm({ code: f.code, name: f.name, address: f.address || '', manager: f.manager || '', phone: f.phone || '' });
    setDialogVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      Taro.showToast({ title: '请填写工厂名称', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        await updateFactory(editingId, form);
      } else {
        await createFactory(form);
      }
      Taro.showToast({ title: '已保存', icon: 'success' });
      setDialogVisible(false);
      await loadFactories();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none', duration: 2500 });
    } finally {
      setSubmitting(false);
    }
  }, [form, editingId, loadFactories]);

  const handleDelete = useCallback((f: FactoryInfo) => {
    Taro.showModal({
      title: '删除确认',
      content: `确定删除工厂「${f.name}」吗？启用中或仍有车间的工厂无法删除。`,
      confirmColor: '#f53f3f',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await deleteFactory(f.id);
          if (currentFactoryId === f.id) setCurrentFactory(null);
          Taro.showToast({ title: '已删除', icon: 'success' });
          await loadFactories();
        } catch (e: any) {
          Taro.showToast({ title: e?.message || '删除失败', icon: 'none', duration: 2500 });
        }
      }
    });
  }, [currentFactoryId, setCurrentFactory, loadFactories]);

  const updateField = (key: keyof FactoryForm, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <View className={styles.page}>
      {/* 页头 */}
      <View className={styles.header}>
        <View>
          <Text className={styles.title}>工厂管理</Text>
          <Text className={styles.sub}>点击卡片切换当前工厂，设备/监控数据将按所选工厂展示</Text>
        </View>
        {isAdmin && (
          <Button className={styles.addBtn} onClick={openCreate}>＋ 新增工厂</Button>
        )}
      </View>

      {/* 工厂卡片列表 */}
      {loading && factories.length === 0 ? (
        <View className={styles.empty}><Text>加载中...</Text></View>
      ) : factories.length === 0 ? (
        <View className={styles.empty}><Text>暂无工厂</Text></View>
      ) : (
        factories.map((f) => (
          <View
            key={f.id}
            className={classnames(styles.card, currentFactoryId === f.id && styles.cardActive)}
            onClick={() => handleSwitch(f)}
          >
            <View className={styles.cardTop}>
              <View className={styles.nameWrap}>
                <View className={styles.dot} />
                <Text className={styles.name}>{f.name}</Text>
                <Text className={styles.code}>{f.code}</Text>
              </View>
              {currentFactoryId === f.id ? (
                <Text className={styles.currentBadge}>✓ 当前工厂</Text>
              ) : (
                <Text className={styles.switchText}>切换</Text>
              )}
            </View>
            <Text className={styles.meta}>
              {f.address || '未填写地址'} · 负责人：{f.manager || '—'}
            </Text>
            <View className={styles.statRow}>
              <View className={styles.stat}>
                <Text className={styles.statValue}>{f.workshopCount ?? 0}</Text>
                <Text className={styles.statLabel}>车间</Text>
              </View>
              <View className={styles.stat}>
                <Text className={styles.statValue}>{f.deviceCount ?? 0}</Text>
                <Text className={styles.statLabel}>设备</Text>
              </View>
              <View className={styles.stat}>
                <Text className={classnames(styles.statValue, styles.green)}>{f.onlineDevices ?? 0}</Text>
                <Text className={styles.statLabel}>在线</Text>
              </View>
              <View className={styles.stat}>
                <Text
                  className={classnames(
                    styles.statValue,
                    (f.pendingAlerts ?? 0) > 0 ? styles.red : styles.green
                  )}
                >
                  {f.pendingAlerts ?? 0}
                </Text>
                <Text className={styles.statLabel}>未处理告警</Text>
              </View>
            </View>
            {isAdmin && (
              <View className={styles.ops} onClick={(e) => e.stopPropagation()}>
                <Text className={styles.opBtn} onClick={() => openEdit(f)}>编辑</Text>
                <Text className={classnames(styles.opBtn, styles.danger)} onClick={() => handleDelete(f)}>删除</Text>
              </View>
            )}
          </View>
        ))
      )}

      {/* 编辑弹层 */}
      {dialogVisible && (
        <View className={styles.mask} onClick={() => setDialogVisible(false)}>
          <View className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.dialogTitle}>{editingId ? '编辑工厂' : '新增工厂'}</Text>
            <View className={styles.formItem}>
              <Text className={styles.formLabel}>工厂编码{editingId ? '（不可改）' : ''}</Text>
              <Input
                className={classnames(styles.formInput, editingId && styles.disabled)}
                value={form.code}
                disabled={!!editingId}
                placeholder="如 F-02"
                maxlength={32}
                onInput={(e) => updateField('code', e.detail.value)}
              />
            </View>
            <View className={styles.formItem}>
              <Text className={styles.formLabel}>工厂名称 *</Text>
              <Input
                className={styles.formInput}
                value={form.name}
                placeholder="如 第二工厂"
                maxlength={64}
                onInput={(e) => updateField('name', e.detail.value)}
              />
            </View>
            <View className={styles.formItem}>
              <Text className={styles.formLabel}>地址</Text>
              <Input
                className={styles.formInput}
                value={form.address}
                maxlength={255}
                onInput={(e) => updateField('address', e.detail.value)}
              />
            </View>
            <View className={styles.formItem}>
              <Text className={styles.formLabel}>负责人</Text>
              <Input
                className={styles.formInput}
                value={form.manager}
                maxlength={64}
                onInput={(e) => updateField('manager', e.detail.value)}
              />
            </View>
            <View className={styles.formItem}>
              <Text className={styles.formLabel}>联系电话</Text>
              <Input
                className={styles.formInput}
                value={form.phone}
                maxlength={32}
                onInput={(e) => updateField('phone', e.detail.value)}
              />
            </View>
            <View className={styles.dialogOps}>
              <Button className={styles.cancelBtn} onClick={() => setDialogVisible(false)}>取消</Button>
              <Button
                className={classnames(styles.saveBtn, submitting && styles.disabled)}
                loading={submitting}
                onClick={handleSave}
              >
                保存
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default FactoryPage;
