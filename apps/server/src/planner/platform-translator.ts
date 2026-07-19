import type { Platform, PlatformTranslationResult, V22ConceptualGraph } from '@awm/shared';

export interface PlatformTranslator {
  readonly platform: Platform;
  translate(graph: V22ConceptualGraph): PlatformTranslationResult;
}

export class PlatformTranslatorRegistry {
  private readonly translators = new Map<Platform, PlatformTranslator>();

  public constructor(translators: readonly PlatformTranslator[]) {
    for (const translator of translators) {
      if (this.translators.has(translator.platform)) throw new Error(`Duplicate conceptual translator for ${translator.platform}.`);
      this.translators.set(translator.platform, translator);
    }
  }

  public get(platform: Platform): PlatformTranslator | null {
    return this.translators.get(platform) ?? null;
  }

  public list(): PlatformTranslator[] {
    return [...this.translators.values()];
  }
}
