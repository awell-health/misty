'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HillLinearConnection, HillLinearSignal } from '@/types';

interface LinearProjectOption {
  id: string;
  name: string;
  url: string;
  targetDate: string | null;
  milestones: { id: string; name: string; targetDate: string | null }[];
}

interface HillLinearPanelProps {
  hillId: string;
  connection?: HillLinearConnection;
  signal: HillLinearSignal | null;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function HillLinearPanel({
  hillId,
  connection,
  signal,
  refreshing,
  error,
  onRefresh,
}: HillLinearPanelProps) {
  const [picking, setPicking] = useState(false);
  const [projects, setProjects] = useState<LinearProjectOption[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const openPicker = useCallback(async () => {
    setPicking(true);
    if (projects) return;
    const res = await fetch('/api/linear/projects');
    const json = await res.json();
    setProjects(json.projects ?? []);
  }, [projects]);

  const connect = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      await fetch(`/api/linear/hills/${hillId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, milestoneId: milestoneId || undefined }),
      });
      setPicking(false);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }, [hillId, projectId, milestoneId, onRefresh]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`/api/linear/hills/${hillId}`, { method: 'DELETE' });
      setMenuOpen(false);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }, [hillId, onRefresh]);

  // No key on this deployment — the integration simply isn't there.
  if (signal && !signal.configured) return null;

  const selected = projects?.find((p) => p.id === projectId);

  if (!connection) {
    return (
      <div className="mt-3">
        {picking ? (
          <div className="flex flex-col gap-2 p-3 border border-border-muted rounded-md">
            <label className="text-xs text-fg-muted">Linear project</label>
            <select
              className="py-1.5 px-2 border border-border-muted rounded-md text-sm bg-bg-default text-fg-default outline-none focus:border-fg-accent"
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setMilestoneId(''); }}
            >
              <option value="">{projects ? 'Select a project…' : 'Loading…'}</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selected && selected.milestones.length > 0 && (
              <>
                <label className="text-xs text-fg-muted">Milestone (optional)</label>
                <select
                  className="py-1.5 px-2 border border-border-muted rounded-md text-sm bg-bg-default text-fg-default outline-none focus:border-fg-accent"
                  value={milestoneId}
                  onChange={(e) => setMilestoneId(e.target.value)}
                >
                  <option value="">Whole project</option>
                  {selected.milestones.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </>
            )}
            <p className="text-xs text-fg-muted leading-relaxed">
              Misty creates a label group named after this hill and keeps one label per scope
              inside it. Tag tickets with those labels to see them here. Nothing else in Linear
              is touched.
            </p>
            <div className="flex gap-2">
              <button
                className="py-1.5 px-3 bg-bg-success-emphasis text-fg-on-emphasis border-none rounded-md text-sm font-medium cursor-pointer disabled:opacity-50 hover:opacity-90"
                onClick={connect}
                disabled={!projectId || busy}
              >
                {busy ? 'Connecting…' : 'Connect'}
              </button>
              <button
                className="py-1.5 px-3 bg-none border border-border-muted rounded-md text-sm text-fg-muted cursor-pointer hover:bg-bg-muted"
                onClick={() => setPicking(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="text-xs text-fg-muted bg-none border-none cursor-pointer p-0 hover:text-fg-accent"
            onClick={openPicker}
          >
            + Connect to Linear
          </button>
        )}
      </div>
    );
  }

  const targetDate = signal?.targetDate
    ? new Date(signal.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-fg-muted">
      <span className="px-1.5 py-0.5 rounded-sm bg-bg-muted text-fg-muted font-medium shrink-0">Linear</span>
      <a
        className="text-fg-accent no-underline truncate hover:underline"
        href={connection.projectUrl}
        target="_blank"
        rel="noreferrer"
      >
        {connection.milestoneName
          ? `${connection.projectName} · ${connection.milestoneName}`
          : connection.projectName}
      </a>
      {targetDate && <span className="shrink-0">due {targetDate}</span>}
      {error && <span className="text-fg-danger shrink-0" title={error}>unavailable</span>}
      <div className="relative ml-auto shrink-0" ref={menuRef}>
        <button
          className="bg-none border-none text-fg-muted cursor-pointer p-1 rounded-sm hover:text-fg-default hover:bg-bg-muted"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Linear connection options"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute top-7 right-0 bg-bg-default border border-border-muted rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.12)] z-20 min-w-[160px] overflow-hidden">
            <button
              className="block w-full py-2 px-3 bg-none border-none text-[13px] text-fg-default cursor-pointer text-left hover:bg-bg-muted"
              onClick={() => { onRefresh(); setMenuOpen(false); }}
              disabled={refreshing}
            >
              {refreshing ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              className="block w-full py-2 px-3 bg-none border-none text-[13px] text-fg-default cursor-pointer text-left hover:bg-bg-muted"
              onClick={disconnect}
              disabled={busy}
              title="Leaves the label group and every label in Linear untouched"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
