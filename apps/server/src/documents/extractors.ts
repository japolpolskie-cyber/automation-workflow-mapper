import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import { DocumentProcessingError } from './document-errors.js';
import type { DocumentExtractor } from './document-extractor.js';

function decodeUtf8(buffer: Buffer): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if (text.includes('\0')) throw new DocumentProcessingError('UNREADABLE_DOCUMENT', 'The file contains binary data and cannot be read as text.');
  return text.replace(/^\uFEFF/, '');
}

export const plainTextExtractor: DocumentExtractor = {
  types: ['txt', 'md', 'csv'],
  async extract({ buffer }) { return decodeUtf8(buffer); }
};

export const jsonExtractor: DocumentExtractor = {
  types: ['json'],
  async extract({ buffer }) {
    const text = decodeUtf8(buffer);
    try { return JSON.stringify(JSON.parse(text) as unknown, null, 2); }
    catch { throw new DocumentProcessingError('INVALID_JSON', 'The JSON document is malformed. Correct it before analysis.'); }
  }
};

export const pdfExtractor: DocumentExtractor = {
  types: ['pdf'],
  async extract({ buffer }) {
    try { return (await pdf(buffer)).text; }
    catch { throw new DocumentProcessingError('UNREADABLE_DOCUMENT', 'Text could not be extracted from this PDF. It may be scanned, encrypted, or damaged.'); }
  }
};

export const docxExtractor: DocumentExtractor = {
  types: ['docx'],
  async extract({ buffer }) {
    try { return (await mammoth.extractRawText({ buffer })).value; }
    catch { throw new DocumentProcessingError('UNREADABLE_DOCUMENT', 'Text could not be extracted from this DOCX file.'); }
  }
};
