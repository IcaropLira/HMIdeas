import { describe, expect, it } from "vitest";
import { createLoaderCache } from "./loaderCache";

describe("cache de carregamento", () => {
  it("carrega uma vez só, mesmo com pedidos simultâneos", async () => {
    let calls = 0;
    const c = createLoaderCache<number>(async () => { calls++; return 7; });
    const [a, b] = await Promise.all([c.get("x"), c.get("x")]);
    expect([a, b]).toEqual([7, 7]);
    expect(calls).toBe(1);
  });
  it("peek é síncrono e só vê o que já carregou", async () => {
    const c = createLoaderCache<string>(async (k) => k.toUpperCase());
    expect(c.peek("a")).toBeUndefined();
    await c.get("a");
    expect(c.peek("a")).toBe("A");
  });
  it("falha ou nulo não ficam no cache e podem ser tentados de novo", async () => {
    let n = 0;
    const c = createLoaderCache<number>(async () => { n++; if (n === 1) throw new Error("x"); if (n === 2) return null; return 3; });
    expect(await c.get("k")).toBeNull();
    expect(await c.get("k")).toBeNull();
    expect(await c.get("k")).toBe(3);
    expect(c.peek("k")).toBe(3);
  });
  it("clear esquece tudo", async () => {
    const c = createLoaderCache<number>(async () => 1);
    await c.get("a");
    c.clear();
    expect(c.peek("a")).toBeUndefined();
  });
});
