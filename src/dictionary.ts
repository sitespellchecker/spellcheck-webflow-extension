import type { SpellChecker } from "./spellcheck/tokenizer.js";

let pending: Promise<SpellChecker> | null = null;

function readText(response: Response, label: string): Promise<string> {
  if (!response.ok) {
    return Promise.reject(new Error(`Could not load the English dictionary (${label}).`));
  }
  return response.text();
}

export function loadDictionary(): Promise<SpellChecker> {
  if (!pending) {
    pending = Promise.all([
      fetch("./dictionaries/en_US.aff.txt").then((response) => readText(response, "aff")),
      fetch("./dictionaries/en_US.dic.txt").then((response) => readText(response, "dic")),
    ])
      .then(([aff, dic]) => {
        const Typo = window.Typo;
        if (!Typo) {
          throw new Error("Could not load the English dictionary.");
        }
        return new Typo("en_US", aff, dic);
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}
