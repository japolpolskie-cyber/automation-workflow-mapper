// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManualNodeLibrary } from './ManualNodeLibrary';
import { manualLibraryFor } from './manual-platform-library';

describe('ManualNodeLibrary', () => {
  it('adds exactly one platform-specific item per click and exposes custom nodes', () => {
    const onAdd = vi.fn();
    render(<ManualNodeLibrary library={manualLibraryFor('make')} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Router' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ service: 'Make.com', operation: 'Router' });
    expect(screen.getByRole('button', { name: 'Custom Node' })).toBeInTheDocument();
  });

  it('updates terminology and draggable items when the platform changes', () => {
    const onAdd = vi.fn();
    const { rerender } = render(<ManualNodeLibrary library={manualLibraryFor('n8n')} onAdd={onAdd} />);
    expect(screen.getByText('Node Library')).toBeInTheDocument();
    rerender(<ManualNodeLibrary library={manualLibraryFor('zapier')} onAdd={onAdd} />);
    expect(screen.getByText('Steps Library')).toBeInTheDocument();
    const paths = screen.getByRole('button', { name: 'Paths' });
    expect(paths).toHaveAttribute('draggable', 'true');
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };
    fireEvent.dragStart(paths, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-awm-library-item', 'paths');
  });
});

