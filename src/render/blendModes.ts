// Modos de mesclagem do Photoshop que o Pixi não traz (0.19): Dissolver, Cor mais escura, Cor mais clara, Matiz e o
// "recorte" usado pela máscara de recorte. Os outros vêm de `pixi.js/advanced-blend-modes`. Precisam de `useBackBuffer`.
import "pixi.js/advanced-blend-modes";
import { BLEND_MODES, BlendModeFilter, ExtensionType, extensions, hslgl, hslgpu } from "pixi.js";

const make = (name: string, glFn: string, glMain: string, gpuFn: string, gpuMain: string) => {
  class B extends BlendModeFilter {
    constructor() { super({ gl: { functions: glFn, main: glMain }, gpu: { functions: gpuFn, main: gpuMain } }); }
    static extension = { name, type: ExtensionType.BlendMode };
  }
  return B;
};

/** Dissolver: cada pixel é a cor de cima OU a de baixo, sorteado pela opacidade (ruído fixo na tela). */
const Dissolve = make("hm-dissolve",
  `float hmRand(vec2 p){ return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }`,
  `vec3 f = front.a > 0.0 ? front.rgb / front.a : vec3(0.0);
   float keep = step(hmRand(gl_FragCoord.xy), front.a);
   finalColor = vec4(mix(back.rgb, f, keep), max(back.a, keep)) * uBlend;`,
  `fn hmRand(p: vec2<f32>) -> f32 { return fract(sin(dot(floor(p), vec2<f32>(12.9898, 78.233))) * 43758.5453); }`,
  `var f = vec3<f32>(0.0);
   if (front.a > 0.0) { f = front.rgb / front.a; }
   let keep = step(hmRand(vTextureCoord * 4096.0), front.a);
   out = vec4<f32>(mix(back.rgb, f, keep), max(back.a, keep)) * blendUniforms.uBlend;`);

const lumGl = `float hmSum(vec3 c){ return c.r * 0.299 + c.g * 0.587 + c.b * 0.114; }`;
const lumGpu = `fn hmSum(c: vec3<f32>) -> f32 { return c.r * 0.299 + c.g * 0.587 + c.b * 0.114; }`;

const DarkerColor = make("hm-darker-color", lumGl,
  `vec3 c = hmSum(front.rgb) < hmSum(back.rgb) ? front.rgb : back.rgb;
   finalColor = vec4(c * front.a + back.rgb * (1.0 - front.a), blendedAlpha) * uBlend;`,
  lumGpu,
  `var c = back.rgb;
   if (hmSum(front.rgb) < hmSum(back.rgb)) { c = front.rgb; }
   out = vec4<f32>(c * front.a + back.rgb * (1.0 - front.a), blendedAlpha) * blendUniforms.uBlend;`);

const LighterColor = make("hm-lighter-color", lumGl,
  `vec3 c = hmSum(front.rgb) > hmSum(back.rgb) ? front.rgb : back.rgb;
   finalColor = vec4(c * front.a + back.rgb * (1.0 - front.a), blendedAlpha) * uBlend;`,
  lumGpu,
  `var c = back.rgb;
   if (hmSum(front.rgb) > hmSum(back.rgb)) { c = front.rgb; }
   out = vec4<f32>(c * front.a + back.rgb * (1.0 - front.a), blendedAlpha) * blendUniforms.uBlend;`);

/** Matiz: a matiz de cima com a saturação e a luminosidade de baixo. */
const Hue = make("hm-hue", hslgl,
  `vec3 c = setLuminosity(setSaturation(front.rgb, getSaturation(back.rgb)), getLuminosity(back.rgb));
   finalColor = vec4(c * front.a + back.rgb * (1.0 - front.a), blendedAlpha) * uBlend;`,
  hslgpu,
  `let c = setLuminosity(setSaturation(front.rgb, getSaturation(back.rgb)), getLuminosity(back.rgb));
   out = vec4<f32>(c * front.a + back.rgb * (1.0 - front.a), blendedAlpha) * blendUniforms.uBlend;`);

/** Recorte ("source-atop"): a camada de cima só aparece onde a base tem conteúdo; a opacidade final é a da base. */
const Clip = make("hm-clip", "",
  `finalColor = vec4(front.rgb * back.a + back.rgb * (1.0 - front.a), back.a) * uBlend;`,
  "",
  `out = vec4<f32>(front.rgb * back.a + back.rgb * (1.0 - front.a), back.a) * blendUniforms.uBlend;`);

extensions.add(Dissolve, DarkerColor, LighterColor, Hue, Clip);

/** Modo do documento → nome do Pixi. */
export function pixiBlend(b: string | undefined): BLEND_MODES {
  switch (b ?? "normal") {
    case "dissolve": return "hm-dissolve" as BLEND_MODES;
    case "darker-color": return "hm-darker-color" as BLEND_MODES;
    case "lighter-color": return "hm-lighter-color" as BLEND_MODES;
    case "hue": return "hm-hue" as BLEND_MODES;
    case "add": return "add";
    default: return (b ?? "normal") as BLEND_MODES;
  }
}
export const CLIP_BLEND = "hm-clip" as BLEND_MODES;

/** Modos que o WebGL faz sozinho (sem ler a tela): não precisam do back buffer. */
const NATIVE = new Set(["normal", "add", "multiply", "screen"]);
export const needsBackBuffer = (b: string | undefined) => !NATIVE.has(b ?? "normal");
