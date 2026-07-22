import type { KnowledgeChunk, KnowledgeDocument } from "./contracts.js";

export const DEFAULT_CHUNK_SIZE = 1_000;

function splitContent(content: string, maximumCharacters: number): string[] {
  if (content.length <= maximumCharacters) return [content];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > maximumCharacters) {
    const candidate = remaining.slice(0, maximumCharacters + 1);
    const breakAt = candidate.lastIndexOf(" ");
    const end = breakAt > 0 ? breakAt : maximumCharacters;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function chunkKnowledgeDocument(
  document: KnowledgeDocument,
  maximumCharacters = DEFAULT_CHUNK_SIZE,
): KnowledgeChunk[] {
  if (!Number.isInteger(maximumCharacters) || maximumCharacters < 1) {
    throw new Error("Chunk size must be a positive integer.");
  }
  return splitContent(document.content, maximumCharacters).map((content, index) => ({
    id: `${document.id}#${index + 1}`,
    documentId: document.id,
    platform: document.platform,
    title: document.title,
    content,
    category: document.category,
    tags: [...document.tags],
    source: { ...document.source },
    version: document.version,
  }));
}
