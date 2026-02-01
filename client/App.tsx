
import React, { useState, useEffect, useRef } from 'react';
import { MilestoneNode } from './components/MilestoneNode';
import { LoginPage } from './components/LoginPage';
import { LoadingScreen } from './components/LoadingScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useMilestones } from './hooks/useMilestones';
import { Milestone, milestonesApi } from './api/client';
import {
  GitBranch,
  Plus,
  X,
  AlertTriangle,
  LogOut,
  Loader2,
  Trash2,
  ArrowUpDown,
  GripVertical
} from 'lucide-react';

const MilestoneTracker: React.FC = () => {
  const { user, loading, loadingStatus, logout } = useAuth();
  const {
    milestones,
    loading: milestonesLoading,
    createMilestone,
    completeMilestone,
    deleteMilestone,
    canCompleteMilestone,
    reorderMilestones,
    refetch,
  } = useMilestones();

  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState<Milestone | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Milestone | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderList, setReorderList] = useState<Milestone[]>([]);
  const isFirstLoad = useRef(true);
  const [dragState, setDragState] = useState({
    activeId: null as string | null,
    initialY: 0,
    currentY: 0,
    startIndex: -1,
    currentIndex: -1,
    itemHeight: 0
  });
  const [confirmLogout, setConfirmLogout] = useState(false);

  // New milestone form state
  const [newMilestone, setNewMilestone] = useState({
    title: '',
    description: '',
    type: 'feature' as Milestone['type'],
    tags: ''
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 첫 로드 시 불완료 첫 번째로 스크롤
  useEffect(() => {
    if (loading || milestones.length === 0 || !isFirstLoad.current) return;

    isFirstLoad.current = false;
    scrollToFirstIncomplete();
  }, [loading, milestones.length]);

  const handleToggleMilestone = (id: string) => {
    const milestone = milestones.find(m => m.id === id);
    if (!milestone) return;

    // Cannot uncheck completed milestones
    if (milestone.completed) return;

    // Cannot complete if previous milestones are incomplete
    if (!canCompleteMilestone(id)) return;

    // Show confirmation modal
    setConfirmComplete(milestone);
  };

  const confirmCompleteMilestoneHandler = async () => {
    if (!confirmComplete) return;

    try {
      const updated = await completeMilestone(confirmComplete.id);
      // Update selected milestone if it's the same
      if (selectedMilestone?.id === confirmComplete.id) {
        setSelectedMilestone(updated);
      }
    } catch (error) {
      console.error('Failed to complete milestone:', error);
    }

    setConfirmComplete(null);
  };

  const confirmDeleteMilestoneHandler = async () => {
    if (!confirmDelete) return;

    try {
      await deleteMilestone(confirmDelete.id);
      // Close details panel if deleted milestone was selected
      if (selectedMilestone?.id === confirmDelete.id) {
        setSelectedMilestone(null);
      }
      // 삭제 후 첫 번째 불완료 마일스톤으로 스크롤
      scrollToFirstIncomplete();
    } catch (error) {
      console.error('Failed to delete milestone:', error);
    }

    setConfirmDelete(null);
  };

  const handleOpenReorder = () => {
    // Filter only incomplete milestones
    const incomplete = milestones.filter(m => !m.completed);
    setReorderList(incomplete);
    setIsReordering(true);
  };

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, id: string, index: number) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const element = (e.currentTarget as HTMLElement).closest('.milestone-item');
    const height = element?.getBoundingClientRect().height || 0;

    setDragState({
      activeId: id,
      initialY: clientY,
      currentY: clientY,
      startIndex: index,
      currentIndex: index,
      itemHeight: height
    });

    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragState.activeId) return;

      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      const deltaY = clientY - dragState.initialY;
      const offsetIndex = Math.round(deltaY / (dragState.itemHeight + 8)); // 8 is the gap + padding
      let newIndex = dragState.startIndex + offsetIndex;
      newIndex = Math.max(0, Math.min(reorderList.length - 1, newIndex));

      setDragState(prev => ({
        ...prev,
        currentY: clientY,
        currentIndex: newIndex
      }));
    };

    const handleEnd = () => {
      if (!dragState.activeId) return;

      if (dragState.startIndex !== dragState.currentIndex) {
        const newList = [...reorderList];
        const [movedItem] = newList.splice(dragState.startIndex, 1);
        newList.splice(dragState.currentIndex, 0, movedItem);
        setReorderList(newList);
      }

      setDragState({
        activeId: null,
        initialY: 0,
        currentY: 0,
        startIndex: -1,
        currentIndex: -1,
        itemHeight: 0
      });

      document.body.style.userSelect = '';
    };

    if (dragState.activeId) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove as any, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove as any);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragState, reorderList]);

  const handleSaveReorder = async () => {
    try {
      const orderedIds = reorderList.map(m => m.id);
      // Optimistic update: UI 즉시 업데이트
      reorderMilestones(orderedIds);
      setIsReordering(false);
      // Reorder 후 첫 번째 불완료 마일스톤으로 스크롤
      scrollToFirstIncomplete();
    } catch (error) {
      console.error('Failed to reorder milestones:', error);
      // reorderMilestones에서 실패시 자동으로 롤백됨
    }
  };

  // Easing 함수 (느리다->빠르다->느려지는)
  const getSmoothStep = (t, k = 6) => {
    // t가 0일 때와 1일 때 예외 처리
    // if (t <= 0) return 0;
    // if (t >= 1) return 1;

    /**
     * [수학 공식]
     * f(t) = (tanh(k * (t - 0.5)) / tanh(0.5 * k) + 1) / 2
     * * - 가우시안 분포의 적분 형태와 유사한 S자 곡선을 생성합니다.
     * - 시작(0)과 끝(1)에서의 기울기가 0에 수렴하여 매우 부드럽습니다.
     * - 별도의 조건문 없이 단일 수식으로 계산되어 버벅임이 없습니다.
     */
    const upper = Math.tanh(k * (t - 0.5));
    const lower = Math.tanh(0.5 * k);
    
    return (upper / lower + 1) / 2;
  };

  // 부드러운 스크롤 애니메이션
  const animateScroll = (container: HTMLElement, targetElement: HTMLElement, duration = 150) => {
    const startScroll = container.scrollTop;
    const targetScroll = targetElement.offsetTop - container.clientHeight / 2;
    const distance = targetScroll - startScroll;
    let start = 0;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = getSmoothStep(progress);

      container.scrollTop = startScroll + distance * ease;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  };

  // 불완료 마일스톤 중 첫 번째로 스크롤
  const scrollToFirstIncomplete = () => {
    setTimeout(() => {
      if (scrollContainerRef.current && milestones.length > 0) {
        const firstIncomplete = milestones.find(m => !m.completed);

        if (firstIncomplete) {
          const nodes = scrollContainerRef.current.querySelectorAll('.relative.flex.items-start.group');
          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i] as HTMLElement;
            if (node.textContent?.includes(firstIncomplete.title) &&
                !node.textContent?.includes('✓ Milestone Completed')) {
              animateScroll(scrollContainerRef.current, node);
              break;
            }
          }
        }
      }
    }, 100);
  };

  // 불완료 마일스톤 중 마지막으로 스크롤
  const scrollToLastIncomplete = () => {
    setTimeout(() => {
      if (scrollContainerRef.current) {
        const nodes = scrollContainerRef.current.querySelectorAll('.relative.flex.items-start.group');
        let lastIncompleteNode: HTMLElement | null = null;
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i] as HTMLElement;
          if (!node.textContent?.includes('✓ Milestone Completed')) {
            lastIncompleteNode = node;
          }
        }
        if (lastIncompleteNode) {
          animateScroll(scrollContainerRef.current, lastIncompleteNode);
        }
      }
    }, 100);
  };

  const handleAddMilestone = async () => {
    if (!newMilestone.title.trim()) return;

    // UI 즉시 초기화 (optimistic)
    setNewMilestone({ title: '', description: '', type: 'feature', tags: '' });
    setIsAdding(false);

    // 백그라운드에서 API 호출
    createMilestone({
      title: newMilestone.title.trim(),
      description: newMilestone.description.trim(),
      type: newMilestone.type,
      tags: newMilestone.tags.split(',').map(t => t.trim()).filter(t => t)
    }).then(() => {
      // 불완료 마일스톤 중 마지막으로 스크롤
      scrollToLastIncomplete();
    }).catch(error => {
      console.error('Failed to create milestone:', error);
    });
  };

  const handleLogoutConfirm = async () => {
    try {
      await logout();
      setConfirmLogout(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const completedCount = milestones.filter(m => m.completed).length;
  const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  if (loading) {
    return <LoadingScreen status={loadingStatus} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      {/* Left Floating Sidebar */}
      <aside className="fixed left-6 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
        <div className="bg-[#161b22]/95 backdrop-blur-md border border-gray-800 rounded-2xl p-5 shadow-2xl shadow-black/50 w-56">
          {/* Logo / Title */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-800">
            <div className="p-2 bg-blue-600 rounded-lg">
              <GitBranch className="text-white" size={18} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Milestones</h1>
              <p className="text-[10px] text-gray-500">Track your progress</p>
            </div>
          </div>

          {/* User Info */}
          {user && (
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-800">
              {user.image ? (
                <img src={user.image} alt={user.name || ''} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                  {user.name?.[0] || user.email[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user.name || user.email}</p>
                <p className="text-[10px] text-gray-500 truncate">{user.provider}</p>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}

          {/* Progress Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Progress</span>
              <span className="text-xs font-bold text-green-500">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-1000"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
              <span><span className="text-green-500 font-bold">{completedCount}</span> done</span>
              <span><span className="text-gray-300 font-bold">{milestones.length - completedCount}</span> left</span>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-lg border border-gray-800">
              <span className="text-xs text-gray-400">Total</span>
              <span className="text-lg font-bold text-white">{milestones.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <span className="text-xs text-green-400">Completed</span>
              <span className="text-lg font-bold text-green-400">{completedCount}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <span className="text-xs text-blue-400">Remaining</span>
              <span className="text-lg font-bold text-blue-400">{milestones.length - completedCount}</span>
            </div>
          </div>

          {/* Reorder Button */}
          {milestones.some(m => !m.completed) && (
            <button
              onClick={handleOpenReorder}
              className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-gray-900/30 mb-3"
            >
              <ArrowUpDown size={18} />
              Reorder
            </button>
          )}

          {/* Add Button */}
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-blue-900/30"
          >
            <Plus size={18} />
            New Milestone
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow flex overflow-hidden w-full">
        {/* Center - Scrollable Graph Container */}
        <section
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto overflow-x-hidden px-4 md:px-12 lg:pl-72 py-12 scroll-smooth"
        >
          <div className="max-w-3xl mx-auto">
            {/* Legend / Info */}
            <div className="flex items-center gap-4 mb-12 pb-8 border-b border-gray-800/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-[10px] uppercase font-bold text-gray-500">Feature</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span className="text-[10px] uppercase font-bold text-gray-500">Release</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-[10px] uppercase font-bold text-gray-500">Critical Fix</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                <span className="text-[10px] uppercase font-bold text-gray-500">Internal</span>
              </div>
            </div>

            {milestones.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                  <GitBranch className="text-gray-600" size={32} />
                </div>
                <h3 className="text-lg font-semibold text-gray-400 mb-2">No milestones yet</h3>
                <p className="text-gray-500 text-sm mb-6">Create your first milestone to start tracking progress</p>
                <button
                  onClick={() => setIsAdding(true)}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  <Plus size={18} />
                  Create Milestone
                </button>
              </div>
            ) : (
              <>
                {milestones.map((milestone, index) => (
                  <MilestoneNode
                    key={milestone.id}
                    milestone={{
                      ...milestone,
                      date: new Date(milestone.date).toISOString().split('T')[0],
                      description: milestone.description || '',
                    }}
                    isLast={index === milestones.length - 1}
                    canComplete={canCompleteMilestone(milestone.id)}
                    onToggle={handleToggleMilestone}
                    onSelect={(m) => setSelectedMilestone(milestone)}
                  />
                ))}

                <div className="h-24 flex items-center justify-center">
                  <button
                    onClick={() => setIsAdding(true)}
                    className="group flex flex-col items-center gap-2 text-gray-600 hover:text-blue-400 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-700 group-hover:border-blue-500 flex items-center justify-center">
                      <Plus size={16} />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-widest">End of Path</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Right Sidebar - Details / Inspector */}
        <aside className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-[#161b22] border-l border-gray-800 z-50 transform transition-transform duration-300 shadow-2xl ${selectedMilestone ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedMilestone && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-[#0d1117]">
                <h2 className="text-xl font-bold text-white">Milestone Details</h2>
                <button onClick={() => setSelectedMilestone(null)} className="p-1 hover:bg-gray-800 rounded">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-6 space-y-8">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600`}>
                      {selectedMilestone.type}
                    </span>
                    {selectedMilestone.completed && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white bg-green-600 flex items-center gap-1">
                        Completed
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">{selectedMilestone.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{selectedMilestone.description}</p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Metadata</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-[#0d1117] rounded-lg border border-gray-800">
                      <span className="block text-[10px] text-gray-500 uppercase mb-1">Created At</span>
                      <span className="text-sm font-mono text-gray-300">
                        {new Date(selectedMilestone.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="p-3 bg-[#0d1117] rounded-lg border border-gray-800">
                      <span className="block text-[10px] text-gray-500 uppercase mb-1">ID</span>
                      <span className="text-sm font-mono text-gray-300">#{selectedMilestone.id.slice(0, 6)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedMilestone.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 bg-gray-800 text-gray-300 rounded text-xs border border-gray-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-[#0d1117] border-t border-gray-800 space-y-3">
                <button
                  onClick={() => setConfirmDelete(selectedMilestone)}
                  className="w-full py-3 rounded-xl font-bold transition-all bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 hover:border-red-600/50 flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  Delete Milestone
                </button>

                {selectedMilestone.completed ? (
                  <div className="w-full py-3 rounded-xl font-bold bg-green-600/20 text-green-400 text-center border border-green-600/30">
                    ✓ Milestone Completed
                  </div>
                ) : canCompleteMilestone(selectedMilestone.id) ? (
                  <button
                    onClick={() => setConfirmComplete(selectedMilestone)}
                    className="w-full py-3 rounded-xl font-bold transition-all bg-green-600 text-white hover:bg-green-500 shadow-lg shadow-green-900/20"
                  >
                    Complete Milestone
                  </button>
                ) : (
                  <div className="w-full py-3 rounded-xl font-bold bg-gray-800 text-gray-500 text-center border border-gray-700">
                    Complete previous milestones first
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* Add Milestone Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] w-full max-w-xl rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
                  <Plus size={20} />
                </div>
                <h2 className="text-xl font-bold text-white">Add New Milestone</h2>
              </div>
              <button onClick={() => setIsAdding(false)} className="p-1 hover:bg-gray-800 rounded">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Title
                </label>
                <input
                  type="text"
                  placeholder="e.g., Alpha Release"
                  value={newMilestone.title}
                  onChange={(e) => setNewMilestone(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Description
                </label>
                <textarea
                  placeholder="Describe this milestone..."
                  value={newMilestone.description}
                  onChange={(e) => setNewMilestone(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#0d1117] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Type
                </label>
                <select
                  value={newMilestone.type}
                  onChange={(e) => setNewMilestone(prev => ({ ...prev, type: e.target.value as Milestone['type'] }))}
                  className="w-full bg-[#0d1117] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                >
                  <option value="feature">Feature</option>
                  <option value="release">Release</option>
                  <option value="fix">Critical Fix</option>
                  <option value="internal">Internal</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g., frontend, api, urgent"
                  value={newMilestone.tags}
                  onChange={(e) => setNewMilestone(prev => ({ ...prev, tags: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                />
              </div>

              <button
                onClick={handleAddMilestone}
                disabled={!newMilestone.title.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-blue-900/10"
              >
                <Plus size={20} />
                Add Milestone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal - Complete */}
      {confirmComplete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-gray-800 flex items-center gap-3">
              <div className="p-2 bg-yellow-600/20 text-yellow-400 rounded-lg">
                <AlertTriangle size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">Confirm Completion</h2>
            </div>

            <div className="p-6">
              <p className="text-gray-400 mb-2">
                Are you sure you want to complete this milestone?
              </p>
              <p className="text-lg font-semibold text-white mb-4">
                "{confirmComplete.title}"
              </p>
              <p className="text-sm text-yellow-400/80 bg-yellow-400/10 px-4 py-3 rounded-lg border border-yellow-400/20">
                ⚠️ This action cannot be undone. Once marked as complete, you cannot uncheck this milestone.
              </p>
            </div>

            <div className="p-6 bg-[#0d1117] border-t border-gray-800 flex gap-3">
              <button
                onClick={() => setConfirmComplete(null)}
                className="flex-1 py-3 rounded-xl font-bold bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmCompleteMilestoneHandler}
                className="flex-1 py-3 rounded-xl font-bold bg-green-600 text-white hover:bg-green-500 transition-all shadow-lg shadow-green-900/20"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal - Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-gray-800 flex items-center gap-3">
              <div className="p-2 bg-red-600/20 text-red-400 rounded-lg">
                <AlertTriangle size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">Confirm Deletion</h2>
            </div>

            <div className="p-6">
              <p className="text-gray-400 mb-2">
                Are you sure you want to delete this milestone?
              </p>
              <p className="text-lg font-semibold text-white mb-4">
                "{confirmDelete.title}"
              </p>
              <p className="text-sm text-red-400/80 bg-red-400/10 px-4 py-3 rounded-lg border border-red-400/20">
                ⚠️ This action cannot be undone. The milestone and all its data will be permanently deleted.
              </p>
            </div>

            <div className="p-6 bg-[#0d1117] border-t border-gray-800 flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl font-bold bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteMilestoneHandler}
                className="flex-1 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-900/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal - Logout */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-gray-800 flex items-center gap-3">
              <div className="p-2 bg-red-600/20 text-red-400 rounded-lg">
                <LogOut size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">Confirm Logout</h2>
            </div>

            <div className="p-6">
              <p className="text-gray-400 mb-2">
                Are you sure you want to logout?
              </p>
              {user && (
                <p className="text-sm text-gray-500 mb-4">
                  You're logged in as <span className="text-white font-semibold">{user.name || user.email}</span>
                </p>
              )}
              <p className="text-sm text-red-400/80 bg-red-400/10 px-4 py-3 rounded-lg border border-red-400/20">
                ⚠️ You will need to log in again to access your milestones.
              </p>
            </div>

            <div className="p-6 bg-[#0d1117] border-t border-gray-800 flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 py-3 rounded-xl font-bold bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleLogoutConfirm}
                className="flex-1 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-900/20"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reorder Modal */}
      {isReordering && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <ArrowUpDown size={20} />
                Reorder Milestones
              </h2>
              <button onClick={() => setIsReordering(false)} className="p-1 hover:bg-gray-800 rounded">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-6 space-y-2">
              {reorderList.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No incomplete milestones to reorder</p>
              ) : (
                reorderList.map((milestone, index) => {
                  const isDragging = dragState.activeId === milestone.id;
                  const dragOffset = dragState.currentY - dragState.initialY;

                  let translateY = 0;
                  if (!isDragging && dragState.activeId) {
                    if (index > dragState.startIndex && index <= dragState.currentIndex) {
                      translateY = -(dragState.itemHeight + 8);
                    } else if (index < dragState.startIndex && index >= dragState.currentIndex) {
                      translateY = dragState.itemHeight + 8;
                    }
                  }

                  return (
                    <div
                      key={milestone.id}
                      className={`milestone-item flex items-center p-4 rounded-lg border-2 transition-all select-none ${
                        isDragging
                          ? 'z-50 border-blue-500 bg-blue-600/10 shadow-2xl ring-2 ring-blue-500/30'
                          : 'z-10 border-gray-700 bg-[#0d1117] hover:border-blue-500'
                      }`}
                      style={{
                        transform: isDragging
                          ? `translateY(${dragOffset}px)`
                          : `translateY(${translateY}px)`,
                        transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
                      }}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold pointer-events-none">
                          {index + 1}
                        </div>
                        <div className="flex-grow min-w-0 pointer-events-none">
                          <h4 className={`font-semibold text-sm ${isDragging ? 'text-blue-400' : 'text-white'}`}>
                            {milestone.title}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">
                            {milestone.description?.substring(0, 50)}
                            {milestone.description && milestone.description.length > 50 ? '...' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex-shrink-0 flex items-center gap-2 ml-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white pointer-events-none ${
                          milestone.type === 'feature' ? 'bg-blue-600' :
                          milestone.type === 'release' ? 'bg-purple-600' :
                          milestone.type === 'fix' ? 'bg-red-600' :
                          'bg-gray-600'
                        }`}>
                          {milestone.type}
                        </span>
                        <div
                          onMouseDown={(e) => handleDragStart(e, milestone.id, index)}
                          onTouchStart={(e) => handleDragStart(e, milestone.id, index)}
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 cursor-ns-resize rounded-lg transition-colors flex-shrink-0 touch-none"
                          title="Drag to reorder (vertical only)"
                        >
                          <GripVertical size={16} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-6 bg-[#0d1117] border-t border-gray-800 flex gap-3">
              <button
                onClick={() => setIsReordering(false)}
                className="flex-1 py-3 rounded-xl font-bold bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveReorder}
                disabled={reorderList.length === 0}
                className="flex-1 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Floating Action Button */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40 flex flex-col gap-3">
        {/* Profile Button + Progress Pill Container */}
        <div className="relative w-14 h-28">
          {/* Profile Button - Top aligned */}
          {user && (
            <button
              onClick={() => setConfirmLogout(true)}
              className={`absolute top-2 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95 z-20 ${
                import.meta.env.MODE === 'production'
                  ? 'shadow-lg shadow-transparent border-2 border-transparent'
                  : 'shadow-2xl shadow-red-900/50 hover:shadow-red-800 border-2 border-red-500/30 hover:border-red-500/60'
              }`}
              title={`Logout - ${user.name || user.email}`}
            >
              {user.image ? (
                <img src={user.image} alt={user.name || ''} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white font-bold">
                  {user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
                </div>
              )}
            </button>
          )}

          {/* Progress Pill - Elongated (wrapping profile) */}
          <svg className="w-14 h-28 absolute top-0 left-0" viewBox="-1 -1 58 114" preserveAspectRatio="xMidYMid meet">
            {/* Background pill shape */}
            <path
              d="M 28 0 A 28 28 0 0 1 56 28 L 56 84 A 28 28 0 0 1 0 84 L 0 28 A 28 28 0 0 1 28 0 Z"
              fill="none"
              stroke="#374151"
              strokeWidth="2"
            />

            {/* Progress pill shape */}
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#16a34a" />
              </linearGradient>
            </defs>
            <path
              d="M 28 0 A 28 28 0 0 1 56 28 L 56 84 A 28 28 0 0 1 0 84 L 0 28 A 28 28 0 0 1 28 0 Z"
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={2 * (28 + 56 + 28 + 48)}
              strokeDashoffset={2 * (28 + 56 + 28 + 48) * (1 - progressPercent / 100)}
              style={{
                transition: 'stroke-dashoffset 0.3s ease-in-out',
              }}
            />
          </svg>

          {/* Percentage text - positioned independently */}
          <span className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 text-[10px] font-bold text-green-400 z-10">
            {String(progressPercent).padStart(2, '0')}%
          </span>
        </div>

        {/* Reorder Button */}
        {milestones.some(m => !m.completed) && (
          <button
            onClick={handleOpenReorder}
            className="w-14 h-14 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center shadow-2xl shadow-gray-900 text-white transition-transform active:scale-95"
            title="Reorder milestones"
          >
            <ArrowUpDown size={24} />
          </button>
        )}

        {/* Add Button */}
        <button
          onClick={() => setIsAdding(true)}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center shadow-2xl shadow-blue-900 text-white transition-transform active:scale-95"
          title="Add milestone"
        >
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

const AppContent: React.FC = () => {
  const { user, loading, loadingStatus } = useAuth();

  if (loading) {
    return <LoadingScreen status={loadingStatus} />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return <MilestoneTracker />;
};

export default App;
