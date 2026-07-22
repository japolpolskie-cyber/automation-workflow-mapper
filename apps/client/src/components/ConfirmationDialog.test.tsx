// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('keeps destructive actions behind explicit cancel or confirm choices', () => {
    const onCancel = vi.fn(); const onConfirm = vi.fn();
    render(<ConfirmationDialog open title="Delete this node?" message="Connected lines will be removed." confirmLabel="Delete node" onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
