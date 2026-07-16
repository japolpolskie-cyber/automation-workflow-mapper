import { describe, expect, it } from 'vitest';
import { DocumentService } from './document-service.js';

const service = new DocumentService();

describe('DocumentService', () => {
  it('extracts and counts UTF-8 text', async () => {
    const result = await service.extract('scope.txt', 'text/plain', Buffer.from('Trigger a workflow\nThen notify sales.'));
    expect(result).toMatchObject({ fileType: 'txt', wordCount: 6, text: 'Trigger a workflow\nThen notify sales.' });
  });

  it('formats valid JSON for review', async () => {
    const result = await service.extract('requirements.json', 'application/json', Buffer.from('{"trigger":"new lead"}'));
    expect(result.text).toContain('\n  "trigger": "new lead"\n');
  });

  it('rejects malformed JSON', async () => {
    await expect(service.extract('requirements.json', 'application/json', Buffer.from('{broken'))).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('rejects a spoofed PDF', async () => {
    await expect(service.extract('scope.pdf', 'application/pdf', Buffer.from('not a pdf'))).rejects.toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
  });

  it('rejects unsupported formats before extraction', async () => {
    await expect(service.extract('scope.exe', 'application/octet-stream', Buffer.from('data'))).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });
});
