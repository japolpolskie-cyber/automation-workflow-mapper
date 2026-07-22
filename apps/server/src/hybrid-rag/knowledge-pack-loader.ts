import {
  KNOWLEDGE_CATALOG_VERSION,
  platformNodeKnowledge,
} from "@awm/knowledge";
import type {
  KnowledgeDocument,
  KnowledgePlatform,
} from "./contracts.js";

export function loadKnowledgePack(
  platform: KnowledgePlatform,
): KnowledgeDocument[] {
  return platformNodeKnowledge
    .filter((item) => item.platform === platform)
    .map((item) => ({
      id: item.id,
      platform,
      title: item.name,
      content: [
        item.description,
        `Use when: ${item.useWhen}`,
        `Do not use when: ${item.doNotUseWhen}`,
      ].join("\n"),
      category: item.canonicalFunctionId,
      tags: [...item.matchTerms],
      source: {
        id: "platform-node-knowledge",
        version: KNOWLEDGE_CATALOG_VERSION,
      },
      version: KNOWLEDGE_CATALOG_VERSION,
    }));
}

export function loadKnowledgePacks(): KnowledgeDocument[] {
  return (["n8n", "make", "zapier"] as const).flatMap(loadKnowledgePack);
}
