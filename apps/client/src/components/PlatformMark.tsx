import type { Platform } from '@awm/shared';

const platformMeta = {
  zapier: { label: 'Zapier', symbol: 'Z', color: '#ff6a3d' },
  make: { label: 'Make', symbol: 'M', color: '#8c6cff' },
  n8n: { label: 'n8n', symbol: 'n', color: '#f05a66' }
} satisfies Record<Platform, { label: string; symbol: string; color: string }>;

export function PlatformMark({ platform, compact = false }: { platform: Platform; compact?: boolean }) {
  const meta = platformMeta[platform];
  return <span className="platform-mark"><span className="platform-symbol" style={{ background: meta.color }}>{meta.symbol}</span>{!compact && meta.label}</span>;
}
