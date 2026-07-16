// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('dashboard', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: [], error: null, meta: { requestId: 'test' } }) })); });
  afterEach(() => vi.unstubAllGlobals());
  it('renders the product outcome and creation action', async () => {
    render(<App />);
    expect(screen.getByRole('banner')).toHaveClass('sticky-global-header');
    expect(screen.getByText(/Turn requirements into/i)).toBeInTheDocument();
    expect(await screen.findByText('Your first workflow starts here')).toBeInTheDocument();
  });
});
