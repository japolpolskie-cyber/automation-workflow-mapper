import { LayoutDashboard, Workflow } from 'lucide-react';
import type { ManualLibraryItem, ManualPlatformLibrary } from './manual-platform-library';

export function ManualNodeLibrary({ library, onAdd }: { library: ManualPlatformLibrary; onAdd: (item: ManualLibraryItem) => void }) {
  return <aside className="node-palette">
    <div className="palette-brand"><Workflow size={18} /><div><strong>{library.title}</strong><span>Click or drag to add a {library.itemNoun}</span></div></div>
    <div className="palette-list" onWheel={(event) => event.stopPropagation()}>
      {library.items.map((item) => <button
        key={item.id}
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/x-awm-library-item', item.id);
        }}
        onClick={() => onAdd(item)}
      ><span className={`palette-dot category-${item.configuration?.manualCustomNode ? 'custom' : item.category}`} />{item.label}</button>)}
    </div>
    <div className="palette-tip"><LayoutDashboard size={15} /><p>Drag nodes to arrange them. Connect handles to define execution order.</p></div>
  </aside>;
}
