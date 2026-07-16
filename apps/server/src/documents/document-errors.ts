export class DocumentProcessingError extends Error {
  public constructor(public readonly code: string, message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'DocumentProcessingError';
  }
}
