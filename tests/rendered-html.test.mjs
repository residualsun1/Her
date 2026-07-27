import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function request(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Her memory garden shell", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();

  assert.match(html, /<title>Her — AI Memory Garden<\/title>/i);
  assert.match(html, /The Garden/);
  assert.match(html, /Save Memory/);
  assert.match(html, /There’s something gentle in this portrait/);
  assert.doesNotMatch(html, /Images keep breathing/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("mock provider routes keep the demo runnable without API keys", async () => {
  const statusResponse = await request("/api/providers");
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.providers.length, 5);
  assert.ok(status.providers.every((provider) => provider.mode === "mock"));

  const chatResponse = await request("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "This picture reminds me of home.",
      provider: "deepseek",
      replyLanguage: "en",
    }),
  });
  assert.equal(chatResponse.status, 200);
  const chat = await chatResponse.json();
  assert.equal(chat.mock, true);
  assert.equal(chat.provider, "deepseek");
  assert.ok(chat.text.length > 20);
});

test("starter preview is removed and project modules are present", async () => {
  const [page, layout, packageJson, herApp, particle, gpu, particleConfig, particleStyles, appStyles, store] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("app/components/HerApp.tsx", root), "utf8"),
    readFile(new URL("app/components/ParticleGarden.tsx", root), "utf8"),
    readFile(new URL("app/components/GpuParticleField.tsx", root), "utf8"),
    readFile(new URL("app/components/particleConfig.ts", root), "utf8"),
    readFile(new URL("app/components/ParticleGarden.module.css", root), "utf8"),
    readFile(new URL("app/components/HerApp.module.css", root), "utf8"),
    readFile(new URL("app/lib/memory/store.ts", root), "utf8"),
  ]);

  assert.match(page, /<HerApp \/>/);
  assert.match(layout, /AI Memory Garden/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /@react-three\/fiber/);
  assert.match(packageJson, /"three"/);
  assert.match(herApp, /粒子数量/);
  assert.match(herApp, /粒子基础大小/);
  assert.match(herApp, /画面保真/);
  assert.match(herApp, /拖尾长度/);
  assert.match(herApp, /边缘剥离阈值/);
  assert.match(herApp, /时间侵蚀率/);
  assert.match(herApp, /余烬寿命/);
  assert.match(herApp, /粒子扩散/);
  assert.match(herApp, /边缘扩散/);
  assert.match(herApp, /边缘扰动/);
  assert.match(herApp, /噪声强度/);
  assert.match(herApp, /噪声频率/);
  assert.match(herApp, /核心保留/);
  assert.match(herApp, /星云密度/);
  assert.match(herApp, /深度强度/);
  assert.match(herApp, /涡流强度/);
  assert.match(herApp, /音频亮度/);
  assert.match(herApp, /深度律动/);
  assert.match(herApp, /亮起速度/);
  assert.match(herApp, /回落速度/);
  assert.match(herApp, /function ParameterNote/);
  assert.match(herApp, /调高会让图像更细腻/);
  assert.match(herApp, /数值越小，粒子越快随强拍亮起/);
  assert.match(herApp, /风向 X/);
  assert.match(herApp, /风向 Y/);
  assert.match(herApp, /律动映射目标/);
  assert.match(herApp, /音频平滑度/);
  assert.doesNotMatch(herApp, /Dispersion <|Particle Size <|Flow Speed <|Subject Detail <|Mouse Force </);
  assert.match(particle, /@react-three\/fiber/);
  assert.match(particle, /r3f-fbo/);
  assert.match(particle, /debouncedCount/);
  assert.match(particle, /imageClarity/);
  assert.match(particle, /imageBase/);
  assert.match(particle, /preserveDrawingBuffer/);
  assert.match(particle, /precomposed/);
  assert.match(gpu, /WebGLRenderTarget/);
  assert.match(gpu, /sobelEdge/);
  assert.match(gpu, /curlNoise/);
  assert.match(gpu, /uPeelThreshold/);
  assert.match(gpu, /uErosionRate/);
  assert.match(gpu, /uHaloLifespan/);
  assert.match(gpu, /uPositionState/);
  assert.match(gpu, /uVelocityState/);
  assert.match(gpu, /uMouseSwirl/);
  assert.match(gpu, /uDepthWave/);
  assert.match(gpu, /uAudioBrightnessStrength/);
  assert.match(gpu, /uAudioBloomStrength/);
  assert.match(gpu, /uDepthReactStrength/);
  assert.match(gpu, /uBass/);
  assert.match(gpu, /uTreble/);
  assert.match(gpu, /TEXTURE_CORE_FRAGMENT/);
  assert.match(gpu, /uImageClarity/);
  assert.match(gpu, /textureCoreMaterial/);
  assert.match(gpu, /contentBounds/);
  assert.match(gpu, /smoothstep\(0\.38, 1\.0, age\)/);
  assert.match(particleConfig, /particleCount: 262_144/);
  assert.match(particleConfig, /particleSize: 2\.8/);
  assert.match(particleConfig, /depthStrength: 50/);
  assert.match(particleConfig, /danceStrength: 7\.5/);
  assert.match(particleConfig, /audioBrightnessStrength: 0\.55/);
  assert.match(particleConfig, /audioAttack: 0\.045/);
  assert.match(particleConfig, /audioRelease: 0\.28/);
  assert.match(particleConfig, /reactTarget: "peel"/);
  assert.match(particleStyles, /\.ready \.imageBase/);
  assert.match(appStyles, /\.parameterNote/);
  assert.match(particleStyles, /transition:[\s\S]*opacity 2200ms/);
  assert.match(store, /indexedDB/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});
