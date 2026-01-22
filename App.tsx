
import React, { useState, useEffect, useRef } from 'react';
import { Milestone } from './types';
import { INITIAL_MILESTONES } from './constants';
import { MilestoneNode } from './components/MilestoneNode';
import {
  GitBranch,
  Plus,
  X,
  AlertTriangle
} from 'lucide-react';

const App: React.FC = () => {
  const [milestones, setMilestones] = useState<Milestone[]>(() => {
    const saved = localStorage.getItem('milestones');
    return saved ? JSON.parse(saved) : INITIAL_MILESTONES;
  });
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState<Milestone | null>(null);

  // New milestone form state
  const [newMilestone, setNewMilestone] = useState({
    title: '',
    description: '',
    type: 'feature' as Milestone['type'],
    tags: ''
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('milestones', JSON.stringify(milestones));
  }, [milestones]);

  // Initial Auto-Scroll to first incomplete milestone
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        const firstIncompleteIndex = milestones.findIndex(m => !m.completed);
        const targetIndex = firstIncompleteIndex === -1 ? milestones.length - 1 : firstIncompleteIndex;

        const nodes = scrollContainerRef.current.querySelectorAll('.relative.flex.items-start.group');
        if (nodes[targetIndex]) {
          nodes[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Check if milestone can be completed (all previous milestones must be completed)
  const canCompleteMilestone = (milestoneId: string): boolean => {
    const index = milestones.findIndex(m => m.id === milestoneId);
    if (index === -1) return false;

    // All previous milestones must be completed
    for (let i = 0; i < index; i++) {
      if (!milestones[i].completed) {
        return false;
      }
    }
    return true;
  };

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

  const confirmCompleteMilestone = () => {
    if (!confirmComplete) return;

    setMilestones(prev => prev.map(m =>
      m.id === confirmComplete.id ? { ...m, completed: true } : m
    ));

    // Update selected milestone if it's the same
    if (selectedMilestone?.id === confirmComplete.id) {
      setSelectedMilestone({ ...confirmComplete, completed: true });
    }

    setConfirmComplete(null);
  };

  const handleAddMilestone = () => {
    if (!newMilestone.title.trim()) return;

    const milestone: Milestone = {
      id: Math.random().toString(36).substr(2, 9),
      title: newMilestone.title.trim(),
      description: newMilestone.description.trim(),
      date: new Date().toISOString().split('T')[0],
      completed: false,
      type: newMilestone.type,
      tags: newMilestone.tags.split(',').map(t => t.trim()).filter(t => t)
    };

    setMilestones(prev => [...prev, milestone]);
    setNewMilestone({ title: '', description: '', type: 'feature', tags: '' });
    setIsAdding(false);
  };

  const completedCount = milestones.filter(m => m.completed).length;
  const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

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
      <main className="flex-grow flex overflow-hidden">
        {/* Center - Scrollable Graph Container */}
        <section
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto px-4 md:px-12 lg:pl-72 py-12 scroll-smooth"
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

            {milestones.map((milestone, index) => (
              <MilestoneNode
                key={milestone.id}
                milestone={milestone}
                isLast={index === milestones.length - 1}
                canComplete={canCompleteMilestone(milestone.id)}
                onToggle={handleToggleMilestone}
                onSelect={setSelectedMilestone}
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
                      <span className="text-sm font-mono text-gray-300">{selectedMilestone.date}</span>
                    </div>
                    <div className="p-3 bg-[#0d1117] rounded-lg border border-gray-800">
                      <span className="block text-[10px] text-gray-500 uppercase mb-1">ID</span>
                      <span className="text-sm font-mono text-gray-300">#{selectedMilestone.id.substr(0, 6)}</span>
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

              <div className="p-6 bg-[#0d1117] border-t border-gray-800">
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

      {/* Confirmation Modal */}
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
                onClick={confirmCompleteMilestone}
                className="flex-1 py-3 rounded-xl font-bold bg-green-600 text-white hover:bg-green-500 transition-all shadow-lg shadow-green-900/20"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Floating Action Button */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsAdding(true)}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center shadow-2xl shadow-blue-900 text-white transition-transform active:scale-95"
        >
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
};

export default App;
