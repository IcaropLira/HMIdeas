import { describe, expect, it } from "vitest";
import { classifyAssets, compareVersions, releasesRepo } from "./repo";

describe("repositório de releases", () => {
  it("deduz dono/repo do GitHub Pages", () => {
    expect(releasesRepo({ hostname: "ana.github.io", pathname: "/hm-ideas/download.html" })).toBe("ana/hm-ideas");
    expect(releasesRepo({ hostname: "ana.github.io", pathname: "/" })).toBe("ana/ana.github.io");
    expect(releasesRepo({ hostname: "ana.github.io", pathname: "/download.html" })).toBe("ana/ana.github.io");
    expect(releasesRepo({ hostname: "localhost", pathname: "/" }, "")).toBeNull();
  });

  it("em outra hospedagem (Vercel, domínio próprio) usa o repositório do package.json", () => {
    expect(releasesRepo({ hostname: "hm-ideas.vercel.app", pathname: "/download.html" }, "ana/hm-ideas")).toBe("ana/hm-ideas");
    expect(releasesRepo({ hostname: "hm-ideas.vercel.app", pathname: "/" }, "valor inválido")).toBeNull();
  });

});

describe("versões", () => {
  it("compara x.y.z", () => {
    expect(compareVersions("0.3.0", "0.2.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.2.0", "0.2.1")).toBeLessThan(0);
  });
});

describe("arquivos da release", () => {
  const mk = (name: string) => ({ name, url: "u/" + name, size: 1 });
  it("separa por sistema e ignora assinaturas/latest.json", () => {
    const d = classifyAssets([
      "HM.Ideas_1.0.0_x64-setup.exe", "HM.Ideas_1.0.0_x64-setup.exe.sig", "HM.Ideas_1.0.0_x64_en-US.msi",
      "HM.Ideas_1.0.0_amd64.AppImage", "HM.Ideas_1.0.0_amd64.deb", "HM.Ideas-1.0.0-1.x86_64.rpm",
      "HM.Ideas_1.0.0_universal.dmg", "HM.Ideas.app.tar.gz", "HM-Ideas_1.0.0.apk", "latest.json",
    ].map(mk));
    expect(d.map((x) => x.platform).sort()).toEqual(["android", "linux", "linux", "linux", "macos", "windows", "windows"]);
    expect(d.find((x) => x.kind === "exe")!.primary).toBe(true);
    expect(d.find((x) => x.kind === "msi")!.primary).toBe(false);
  });
});
