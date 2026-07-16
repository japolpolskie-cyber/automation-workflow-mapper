import type { SupportedDocumentType } from '@awm/shared';

export interface DocumentExtractionInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  type: SupportedDocumentType;
}

export interface DocumentExtractor {
  readonly types: readonly SupportedDocumentType[];
  extract(input: DocumentExtractionInput): Promise<string>;
}
