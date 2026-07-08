'use client';

import { Hill } from '@/types';

interface HillPotOfGoldProps {
  hills: Hill[];
  onToggleCompleted: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function HillPotOfGold({ hills, onToggleCompleted, onOpen }: HillPotOfGoldProps) {
  if (hills.length === 0) return null;

  return (
    <div className="mt-10 pt-6 border-t border-border-muted">
      <div className="flex items-center gap-2 mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 10h14v2a5 5 0 01-5 5h-4a5 5 0 01-5-5v-2z" fill="#d4a72c" />
          <path d="M4 9h16a1 1 0 011 1v1H3v-1a1 1 0 011-1z" fill="#9a6700" />
          <path d="M9 5a3 3 0 016 0v4h-2V5a1 1 0 10-2 0v4H9V5z" fill="#d4a72c" />
        </svg>
        <h2 className="text-base font-semibold text-fg-default m-0">
          Pot of gold
        </h2>
        <span className="text-xs text-fg-muted">{hills.length} complete</span>
      </div>
      <div className="flex flex-col gap-2">
        {hills.map((hill) => (
          <div
            key={hill.id}
            className="flex items-center gap-2 p-3 border border-border-muted rounded-md bg-bg-muted cursor-pointer transition-colors hover:border-fg-accent"
            onClick={() => onOpen(hill.id)}
          >
            <span className="flex-1 flex items-baseline gap-2 min-w-0">
              <span className="text-sm font-medium text-fg-default line-through decoration-fg-muted truncate">
                {hill.title || 'Untitled hill'}
              </span>
              {hill.completedAt && (
                <span
                  className="text-xs text-fg-muted shrink-0"
                  title={new Date(hill.completedAt).toLocaleString()}
                >
                  {new Date(hill.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </span>
            <button
              className="flex items-center justify-center bg-none border-none text-fg-danger cursor-pointer p-1 rounded-sm hover:opacity-80 hover:bg-bg-danger-subtle"
              onClick={(e) => { e.stopPropagation(); onToggleCompleted(hill.id); }}
              aria-label={`Move ${hill.title || 'Untitled hill'} back to hills`}
              title="Move back to hills"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
