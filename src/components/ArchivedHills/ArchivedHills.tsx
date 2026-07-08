'use client';

import { useState } from 'react';
import { Hill } from '@/types';

interface ArchivedHillsProps {
  hills: Hill[];
  onToggleArchived: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function ArchivedHills({ hills, onToggleArchived, onOpen }: ArchivedHillsProps) {
  const [expanded, setExpanded] = useState(false);

  if (hills.length === 0) return null;

  return (
    <div className="mt-10 pt-6 border-t border-border-muted">
      <button
        className="flex items-center gap-2 bg-none border-none p-0 cursor-pointer text-fg-default hover:text-fg-accent"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
          className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          aria-hidden
        >
          <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
        </svg>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M1.75 2.5a.75.75 0 00-.75.75v1.5c0 .414.336.75.75.75h12.5a.75.75 0 00.75-.75v-1.5a.75.75 0 00-.75-.75H1.75zM2.5 6.5v6.25c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V6.5H2.5zm4 1.5h3a.75.75 0 010 1.5h-3a.75.75 0 010-1.5z" />
        </svg>
        <h2 className="text-base font-semibold m-0">Archived</h2>
        <span className="text-xs text-fg-muted">{hills.length}</span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 mt-3">
          {hills.map((hill) => (
            <div
              key={hill.id}
              className="flex items-center gap-2 p-3 border border-border-muted rounded-md bg-bg-muted cursor-pointer transition-colors hover:border-fg-accent"
              onClick={() => onOpen(hill.id)}
            >
              <span className="flex-1 flex items-baseline gap-2 min-w-0">
                <span className="text-sm font-medium text-fg-default truncate">
                  {hill.title || 'Untitled hill'}
                </span>
                <span className="text-xs text-fg-muted shrink-0">
                  {hill.scopes.length} {hill.scopes.length === 1 ? 'scope' : 'scopes'}
                </span>
              </span>
              <button
                className="text-xs text-fg-muted border border-border-muted rounded-md bg-bg-default cursor-pointer py-1 px-2 hover:text-fg-default hover:border-fg-accent"
                onClick={(e) => { e.stopPropagation(); onToggleArchived(hill.id); }}
                aria-label={`Unarchive ${hill.title || 'Untitled hill'}`}
                title="Restore to hills"
              >
                Unarchive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
