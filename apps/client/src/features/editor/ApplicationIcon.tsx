import { Bot, Database, Globe2, Wrench } from 'lucide-react';

const marks: Record<string, { label: string; color: string; background: string }> = {
  facebook: { label: 'f', color: '#fff', background: '#1877f2' }, instagram: { label: '◎', color: '#fff', background: '#c13584' }, messenger: { label: 'M', color: '#fff', background: '#0084ff' }, slack: { label: 'S', color: '#fff', background: '#611f69' }, discord: { label: 'D', color: '#fff', background: '#5865f2' }, hubspot: { label: 'H', color: '#fff', background: '#ff7a59' }, salesforce: { label: 'SF', color: '#fff', background: '#00a1e0' }, gohighlevel: { label: 'HL', color: '#fff', background: '#16a77a' }, 'google-sheets': { label: 'G', color: '#fff', background: '#0f9d58' }, airtable: { label: 'A', color: '#fff', background: '#f82b60' }, notion: { label: 'N', color: '#fff', background: '#111' }, clickup: { label: 'C', color: '#fff', background: '#7b68ee' }, asana: { label: 'A', color: '#fff', background: '#f06a6a' }, openai: { label: 'AI', color: '#fff', background: '#168a72' }, gemini: { label: 'G', color: '#fff', background: '#4e75f2' }, 'google-drive': { label: '△', color: '#fff', background: '#4285f4' }, dropbox: { label: 'D', color: '#fff', background: '#06f' }, stripe: { label: 'S', color: '#fff', background: '#635bff' }, shopify: { label: 'S', color: '#fff', background: '#6ab344' }, woocommerce: { label: 'W', color: '#fff', background: '#96588a' }, xero: { label: 'X', color: '#fff', background: '#13b5ea' }, quickbooks: { label: 'Q', color: '#fff', background: '#2ca01c' }, twilio: { label: 'T', color: '#fff', background: '#f22f46' }, gmail: { label: 'M', color: '#b3261e', background: '#fff' }, outlook: { label: 'O', color: '#fff', background: '#087ad8' }, webhook: { label: '↗', color: '#fff', background: '#52677a' }, 'generic-api': { label: 'API', color: '#fff', background: '#52677a' },
};

export function ApplicationIcon({ icon }: { icon: string }) {
  const mark = marks[icon];
  if (mark) return <span className="application-icon" title={icon} style={{ color: mark.color, background: mark.background }}>{mark.label}</span>;
  const Icon = icon.includes('ai') ? Bot : icon.includes('database') ? Database : icon.includes('api') ? Globe2 : Wrench;
  return <span className="application-icon generic" title={icon}><Icon size={16} /></span>;
}
