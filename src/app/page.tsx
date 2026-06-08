'use client';

import { useHills } from '@/context/HillsContext';
import HillGrid from '@/components/HillGrid/HillGrid';

export default function Page() {
  const { hills, loading, addHill, deleteHill, duplicateHill, reorderHills, oooSettings, updateOOOSettings } = useHills();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--fg-muted)' }}>
        Loading...
      </div>
    );
  }

  return (
    <HillGrid
      hills={hills}
      onAddHill={addHill}
      onDeleteHill={deleteHill}
      onDuplicateHill={duplicateHill}
      onReorderHills={reorderHills}
      oooSettings={oooSettings}
      onUpdateOOOSettings={updateOOOSettings}
    />
  );
}
