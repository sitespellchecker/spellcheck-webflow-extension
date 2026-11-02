interface TypoInstance {
  check(word: string): boolean;
  suggest(word: string, limit?: number): string[];
}

interface TypoConstructor {
  new (
    dictionary: string,
    affData: string,
    wordsData: string,
  ): TypoInstance;
}

declare global {
  interface Window {
    Typo?: TypoConstructor;
  }
}

export {};
