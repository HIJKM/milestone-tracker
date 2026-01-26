
import React from 'react';
import { Milestone } from '../types';
import { COLORS } from '../constants';
import { CheckCircle2, Clock, Tag, ChevronRight, Lock } from 'lucide-react';

interface MilestoneNodeProps {
  milestone: Milestone;
  isLast: boolean;
  canComplete: boolean;
  onToggle: (id: string) => void;
  onSelect: (milestone: Milestone) => void;
}

export const MilestoneNode: React.FC<MilestoneNodeProps> = ({
  milestone,
  isLast,
  canComplete,
  onToggle,
  onSelect
}) => {
  const typeColor = COLORS[milestone.type];

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!milestone.completed && canComplete) {
      onToggle(milestone.id);
    }
  };

  const isLocked = !milestone.completed && !canComplete;

  return (
    <div className="relative flex items-start group mb-8 sm:mb-12">
      {/* Git Graph Line */}
      {!isLast && (
        <div className={`absolute left-[11px] top-8 w-[2px] h-full ${milestone.completed ? 'bg-green-500/50' : 'bg-gray-700'} group-hover:bg-blue-400 transition-colors`}></div>
      )}

      {/* Node Bullet */}
      <div className="relative z-10 mr-3 sm:mr-8 flex-shrink-0 pt-1">
        <button
          onClick={handleToggleClick}
          disabled={milestone.completed || isLocked}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
            milestone.completed
              ? 'bg-green-500 border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)] cursor-default'
              : isLocked
                ? 'bg-[#0d1117] border-gray-700 cursor-not-allowed opacity-50'
                : 'bg-[#0d1117] border-gray-600 group-hover:border-blue-400 hover:border-blue-500 cursor-pointer'
          }`}
          title={
            milestone.completed
              ? 'Completed'
              : isLocked
                ? 'Complete previous milestones first'
                : 'Click to complete'
          }
        >
          {milestone.completed ? (
            <CheckCircle2 size={14} className="text-white" />
          ) : isLocked ? (
            <Lock size={10} className="text-gray-600" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-gray-600 group-hover:bg-blue-400" />
          )}
        </button>
      </div>

      {/* Content Card */}
      <div
        onClick={() => onSelect(milestone)}
        className={`flex-grow p-3 sm:p-5 rounded-xl border transition-all duration-300 cursor-pointer min-w-0 max-w-full ${
          milestone.completed
            ? 'bg-[#161b22] border-green-500/30'
            : isLocked
              ? 'bg-[#161b22] border-gray-800 opacity-60'
              : 'bg-[#161b22] border-gray-800 hover:border-blue-500/50 hover:bg-[#1c2128]'
        }`}
      >
        {/* Mobile Layout */}
        <div className="sm:hidden space-y-2 w-full">
          {/* Type & Locked Column */}
          <div className="flex flex-row gap-1">
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white w-fit ${typeColor}`}>
              {milestone.type}
            </span>
            {isLocked && (
              <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-gray-500 bg-gray-800 flex items-center gap-1 w-fit">
                <Lock size={8} />
                Locked
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className={`text-xl font-semibold break-words word-break ${milestone.completed ? 'text-gray-100' : isLocked ? 'text-gray-500' : 'text-gray-300'}`}>
            {milestone.title}
          </h3>

          {/* Date */}
          <div className="flex items-center text-xs text-gray-500">
            <Clock size={10} className="mr-1" />
            {milestone.date}
          </div>

          {/* Description */}
          <p className={`text-sm line-clamp-2 ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>
            {milestone.description}
          </p>

          {/* Tags */}
          {milestone.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {milestone.tags.slice(0, 2).map(tag => (
                <span key={tag} className="flex items-center text-[10px] px-1.5 py-0.5 bg-[#21262d] text-gray-400 rounded-full border border-gray-700">
                  <Tag size={8} className="mr-0.5" />
                  {tag}
                </span>
              ))}
              {milestone.tags.length > 2 && (
                <span className="text-[8px] px-1.5 py-0.5 text-gray-500">+{milestone.tags.length - 2}</span>
              )}
            </div>
          )}
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:block space-y-4">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white flex-shrink-0 ${typeColor}`}>
                {milestone.type}
              </span>
              {isLocked && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-800 flex items-center gap-1 flex-shrink-0">
                  <Lock size={8} />
                  Locked
                </span>
              )}
              <h3 className={`text-lg font-semibold ${milestone.completed ? 'text-gray-100' : isLocked ? 'text-gray-500' : 'text-gray-400'}`}>
                {milestone.title}
              </h3>
            </div>
            <div className="flex items-center text-xs text-gray-500 flex-shrink-0 ml-2">
              <Clock size={12} className="mr-1" />
              {milestone.date}
            </div>
          </div>

          <p className={`text-sm mb-4 line-clamp-2 ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>
            {milestone.description}
          </p>

          <div className="flex flex-wrap gap-2">
            {milestone.tags.map(tag => (
              <span key={tag} className="flex items-center text-[10px] px-2 py-0.5 bg-[#21262d] text-gray-400 rounded-full border border-gray-700">
                <Tag size={10} className="mr-1" />
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Hover Detail Indicator */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
        <ChevronRight size={20} className="text-blue-500" />
      </div>
    </div>
  );
};
