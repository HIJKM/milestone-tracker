import { useState, useEffect, useCallback } from 'react';
import { milestonesApi, Milestone, CreateMilestoneData, UpdateMilestoneData } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export const useMilestones = () => {
  const { user } = useAuth();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMilestones = useCallback(async () => {
    if (!user) {
      setMilestones([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await milestonesApi.getAll();
      setMilestones(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch milestones');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const createMilestone = async (data: CreateMilestoneData) => {
    try {
      const newMilestone = await milestonesApi.create(data);
      setMilestones(prev => [...prev, newMilestone]);
      return newMilestone;
    } catch (err) {
      throw err;
    }
  };

  const updateMilestone = async (id: string, data: UpdateMilestoneData) => {
    try {
      const updated = await milestonesApi.update(id, data);
      setMilestones(prev => prev.map(m => (m.id === id ? updated : m)));
      return updated;
    } catch (err) {
      throw err;
    }
  };

  const deleteMilestone = async (id: string) => {
    try {
      await milestonesApi.delete(id);
      setMilestones(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      throw err;
    }
  };

  const completeMilestone = async (id: string) => {
    return updateMilestone(id, { completed: true });
  };

  const canCompleteMilestone = (id: string): boolean => {
    const index = milestones.findIndex(m => m.id === id);
    if (index === -1) return false;

    // All previous milestones must be completed
    for (let i = 0; i < index; i++) {
      if (!milestones[i].completed) {
        return false;
      }
    }
    return true;
  };

  const reorderMilestones = async (orderedIds: string[]) => {
    const oldMilestones = milestones;

    // UI 즉시 업데이트 (optimistic)
    // 원래 순서 유지하면서 불완료만 순서 변경
    const reorderedMap = new Map(orderedIds.map((id, idx) => [id, idx]));
    const reorderedMilestones = [...milestones].sort((a, b) => {
      const aOrder = reorderedMap.get(a.id);
      const bOrder = reorderedMap.get(b.id);

      // 둘 다 불완료면 새 순서로 정렬
      if (aOrder !== undefined && bOrder !== undefined) {
        return aOrder - bOrder;
      }

      // 완료된 것들은 원래 순서 유지
      return 0;
    });
    setMilestones(reorderedMilestones);

    // 백그라운드에서 API 호출
    try {
      await milestonesApi.reorder(orderedIds);
    } catch (err) {
      // 실패시 원래 상태로 롤백
      setMilestones(oldMilestones);
      throw err;
    }
  };

  return {
    milestones,
    loading,
    error,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    completeMilestone,
    canCompleteMilestone,
    reorderMilestones,
    refetch: fetchMilestones,
  };
};
