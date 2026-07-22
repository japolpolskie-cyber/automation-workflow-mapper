// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiAttachmentPicker } from './AiAttachmentPicker';

describe('AiAttachmentPicker', () => {
  it('shows only compatible model options and returns the selected provider', () => {
    const onSelect = vi.fn();
    render(<AiAttachmentPicker type="chat-model" onSelect={onSelect} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /OpenAI Chat Model/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Simple Memory/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ollama Chat Model/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'ollama', type: 'chat-model' }));
  });

  it('exposes common n8n tools through the tool picker', () => {
    render(<AiAttachmentPicker type="tool" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /HTTP Request Tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MCP Server/i })).toBeInTheDocument();
  });
});
