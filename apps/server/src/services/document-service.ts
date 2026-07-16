import { extname } from 'node:path';
import { extractedDocumentSchema, type ExtractedDocument, type SupportedDocumentType } from '@awm/shared';
import { DocumentProcessingError } from '../documents/document-errors.js';
import type { DocumentExtractor } from '../documents/document-extractor.js';
import { docxExtractor, jsonExtractor, pdfExtractor, plainTextExtractor } from '../documents/extractors.js';

const MAX_TEXT_LENGTH = 100_000;
const typeByExtension: Record<string, SupportedDocumentType | undefined> = { '.txt': 'txt', '.md': 'md', '.markdown': 'md', '.pdf': 'pdf', '.docx': 'docx', '.csv': 'csv', '.json': 'json' };
const allowedMimeTypes: Record<SupportedDocumentType, readonly string[]> = {
  txt: ['text/plain', 'application/octet-stream'], md: ['text/markdown', 'text/plain', 'application/octet-stream'],
  pdf: ['application/pdf'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
  csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'], json: ['application/json', 'text/json', 'text/plain']
};

function cleanFileName(name: string): string {
  const invalidCharacters = '\\/:*?"<>|';
  return [...name].map((character) => character.charCodeAt(0) < 32 || invalidCharacters.includes(character) ? '_' : character).join('').replace(/\.\.+/g, '.').slice(0, 180) || 'document';
}

function verifySignature(type: SupportedDocumentType, buffer: Buffer): void {
  if (type === 'pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new DocumentProcessingError('FILE_SIGNATURE_MISMATCH', 'The uploaded file does not contain a valid PDF signature.');
  if (type === 'docx' && buffer.subarray(0, 2).toString('ascii') !== 'PK') throw new DocumentProcessingError('FILE_SIGNATURE_MISMATCH', 'The uploaded file does not contain a valid DOCX signature.');
}

export class DocumentService {
  public constructor(private readonly extractors: readonly DocumentExtractor[] = [plainTextExtractor, jsonExtractor, pdfExtractor, docxExtractor]) {}

  public async extract(fileName: string, mimeType: string, buffer: Buffer): Promise<ExtractedDocument> {
    const sanitizedName = cleanFileName(fileName);
    const type = typeByExtension[extname(sanitizedName).toLowerCase()];
    if (!type) throw new DocumentProcessingError('UNSUPPORTED_FILE_TYPE', 'Unsupported file type. Upload TXT, Markdown, PDF, DOCX, CSV, or JSON.');
    if (!allowedMimeTypes[type].includes(mimeType.toLowerCase())) throw new DocumentProcessingError('INVALID_MIME_TYPE', `The file content type does not match a supported ${type.toUpperCase()} document.`);
    if (!buffer.length) throw new DocumentProcessingError('EMPTY_FILE', 'The uploaded file is empty.');
    verifySignature(type, buffer);
    const extractor = this.extractors.find((candidate) => candidate.types.includes(type));
    if (!extractor) throw new DocumentProcessingError('EXTRACTOR_UNAVAILABLE', `No extractor is configured for ${type.toUpperCase()} documents.`, 500);
    const rawText = (await extractor.extract({ buffer, fileName: sanitizedName, mimeType, type })).replace(/\r\n/g, '\n').trim();
    if (!rawText) throw new DocumentProcessingError('NO_READABLE_TEXT', 'No readable text was found in the document.');
    const truncated = rawText.length > MAX_TEXT_LENGTH;
    const text = rawText.slice(0, MAX_TEXT_LENGTH);
    return extractedDocumentSchema.parse({ fileName: sanitizedName, fileType: type, mimeType, size: buffer.length, text, characterCount: text.length, wordCount: text.match(/\S+/g)?.length ?? 0, warnings: truncated ? ['Extracted text was limited to 100,000 characters.'] : [] });
  }
}
