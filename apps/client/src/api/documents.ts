import type { ExtractedDocument } from '@awm/shared';
import { request } from './projects';

export const documentApi = {
  extract: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<ExtractedDocument>('/documents/extract', { method: 'POST', body });
  }
};
