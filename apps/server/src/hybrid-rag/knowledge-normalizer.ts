import type { KnowledgeDocument, KnowledgePlatform } from "./contracts.js";

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const normalizeSearchValue = (value: string): string =>
  normalizeWhitespace(value).toLowerCase();

const normalizeIdPart = (value: string): string =>
  normalizeSearchValue(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const platforms = new Set<KnowledgePlatform>(["n8n", "make", "zapier"]);

export function normalizeKnowledgeDocument(
  document: KnowledgeDocument,
): KnowledgeDocument {
  const platform = normalizeSearchValue(document.platform) as KnowledgePlatform;
  if (!platforms.has(platform)) {
    throw new Error(`Unsupported knowledge platform: ${document.platform}`);
  }
  return {
    ...document,
    id: `${platform}.${normalizeIdPart(document.id.replace(/^[^.]+\./, ""))}`,
    platform,
    title: normalizeWhitespace(document.title),
    content: normalizeWhitespace(document.content),
    category: normalizeSearchValue(document.category),
    tags: [...new Set(document.tags.map(normalizeSearchValue).filter(Boolean))].sort(),
    source: {
      id: normalizeIdPart(document.source.id),
      version: normalizeWhitespace(document.source.version),
    },
    version: normalizeWhitespace(document.version),
  };
}

export const normalizeSearchText = normalizeSearchValue;
