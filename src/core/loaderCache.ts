// Cache assíncrono por chave (puro, sem DOM/Pixi): carrega cada chave uma única vez.
/** Cache genérico por chave com deduplicação de cargas em andamento (testável sem Pixi/DOM). */
export function createLoaderCache<T>(load: (key: string) => Promise<T | null>) {
  const ready = new Map<string, T>();
  const pending = new Map<string, Promise<T | null>>();
  return {
    /** Valor já carregado (síncrono) ou undefined. */
    peek: (key: string): T | undefined => ready.get(key),
    /** Carrega uma vez só, mesmo que vários elementos peçam a mesma imagem ao mesmo tempo. */
    get(key: string): Promise<T | null> {
      const hit = ready.get(key);
      if (hit !== undefined) return Promise.resolve(hit);
      let p = pending.get(key);
      if (!p) {
        p = load(key)
          .then((v) => { if (v !== null) ready.set(key, v); return v; })
          .catch(() => null)
          .finally(() => { pending.delete(key); });
        pending.set(key, p);
      }
      return p;
    },
    /** Remove e devolve o valor carregado (para o chamador liberar o recurso). */
    take(key: string): T | undefined { const v = ready.get(key); ready.delete(key); return v; },
    values: () => Array.from(ready.values()),
    clear() { ready.clear(); pending.clear(); },
  };
}
