import type {
  KnowledgePlatform,
  RetrievalResult,
} from "./contracts.js";

export const HYBRID_FUSION_WEIGHTS = {
  keyword: 0.45,
  vector: 0.55,
} as const;

export function fuseRetrievalResults(
  keyword: RetrievalResult,
  vector: RetrievalResult,
  platform: KnowledgePlatform,
  limit = 10,
  weights = HYBRID_FUSION_WEIGHTS,
): RetrievalResult {
  const chunks = new Map(
    [...keyword.chunks, ...vector.chunks]
      .filter((chunk) => chunk.platform === platform)
      .map((chunk) => [chunk.id, chunk]),
  );
  const keywordScores = new Map(
    keyword.scores.map((score) => [score.chunkId, score.keywordScore]),
  );
  const vectorScores = new Map(
    vector.scores.map((score) => [score.chunkId, score.vectorScore]),
  );
  const ranked = [...chunks.values()]
    .map((chunk) => {
      const keywordScore = keywordScores.get(chunk.id) ?? 0;
      const vectorScore = vectorScores.get(chunk.id) ?? 0;
      return {
        chunk,
        keywordScore,
        vectorScore,
        combinedScore:
          keywordScore * weights.keyword + vectorScore * weights.vector,
      };
    })
    .filter(({ combinedScore }) => combinedScore > 0)
    .sort(
      (left, right) =>
        right.combinedScore - left.combinedScore ||
        left.chunk.id.localeCompare(right.chunk.id),
    )
    .slice(0, Math.max(0, Math.floor(limit)));
  return {
    chunks: ranked.map(({ chunk }) => chunk),
    scores: ranked.map(({ chunk, combinedScore, keywordScore, vectorScore }) => ({
      chunkId: chunk.id,
      combinedScore,
      keywordScore,
      vectorScore,
    })),
  };
}
