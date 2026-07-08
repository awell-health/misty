'use client';

import { useState, useRef } from 'react';
import { Scope } from '@/types';
import ScopeCard from './ScopeCard';

interface ScopePanelProps {
  scopes: Scope[];
  onAddScope: (name: string) => void;
  onDeleteScope: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onUpdateName: (scopeId: string, name: string) => void;
  onUpdateDescription: (scopeId: string, description: string) => void;
  onUpdateColor: (scopeId: string, color: string) => void;
  onToggleHidden: (scopeId: string) => void;
  onToggleCompleted: (scopeId: string) => void;
  moveTargets: { id: string; title: string }[];
  onMoveScope: (scopeId: string, toHillId: string) => void;
}

export default function ScopePanel({
  scopes,
  onAddScope,
  onDeleteScope,
  onReorder,
  onUpdateName,
  onUpdateDescription,
  onUpdateColor,
  onToggleHidden,
  onToggleCompleted,
  moveTargets,
  onMoveScope,
}: ScopePanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const handleSubmit = () => {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddScope(trimmed);
      setNewName('');
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setNewName('');
      setIsAdding(false);
    }
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragEnter = (index: number) => {
    dragCounter.current++;
    setOverIndex(index);
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setOverIndex(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      onReorder(dragIndex, index);
    }
    setDragIndex(null);
    setOverIndex(null);
    dragCounter.current = 0;
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
    dragCounter.current = 0;
  };

  return (
    <div className="mt-4">
      <div className="mb-3">
        {isAdding ? (
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 py-2 px-3 border border-border-muted rounded-md text-sm outline-none text-fg-default focus:border-fg-accent focus:shadow-[0_0_0_3px_var(--bg-accent-subtle)]"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scope name..."
              autoFocus
            />
            <button className="py-2 px-4 bg-bg-success-emphasis text-fg-on-emphasis border-none rounded-md text-sm font-medium cursor-pointer hover:opacity-90" onClick={handleSubmit}>
              Add
            </button>
            <button
              className="py-2 px-3 bg-none border border-border-muted rounded-md text-sm text-fg-muted cursor-pointer hover:bg-bg-muted"
              onClick={() => { setNewName(''); setIsAdding(false); }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className="py-2 px-4 bg-bg-success-emphasis text-fg-on-emphasis border-none rounded-md text-sm font-medium cursor-pointer hover:opacity-90" onClick={() => setIsAdding(true)}>
            Add a scope
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {scopes.map((scope, index) => (
          <ScopeCard
            key={scope.id}
            scope={scope}
            onDelete={onDeleteScope}
            onUpdateName={onUpdateName}
            onUpdateDescription={onUpdateDescription}
            onUpdateColor={onUpdateColor}
            onToggleHidden={() => onToggleHidden(scope.id)}
            onToggleCompleted={() => onToggleCompleted(scope.id)}
            moveTargets={moveTargets}
            onMove={(toHillId) => onMoveScope(scope.id, toHillId)}
            isDragging={dragIndex === index}
            isDragOver={overIndex === index && dragIndex !== index}
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
