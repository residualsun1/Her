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
  assert.match(html, /THE GARDEN/);
  assert.match(html, /Save Memory/);
  assert.match(html, /There’s something gentle in this portrait/);
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
  const [page, layout, packageJson, herApp, particle, particleStyles, store] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("app/components/HerApp.tsx", root), "utf8"),
    readFile(new URL("app/components/ParticleGarden.tsx", root), "utf8"),
    readFile(new URL("app/components/ParticleGarden.module.css", root), "utf8"),
    readFile(new URL("app/lib/memory/store.ts", root), "utf8"),
  ]);

  assert.match(page, /<HerApp \/>/);
  assert.match(layout, /AI Memory Garden/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(herApp, /粒子扩散/);
  assert.match(herApp, /粒子大小/);
  assert.match(herApp, /流动速度/);
  assert.match(herApp, /主体细节/);
  assert.match(herApp, /鼠标力场强度/);
  assert.match(herApp, /辉光强度/);
  assert.match(herApp, /拖尾长度/);
  assert.match(herApp, /泛光阈值/);
  assert.match(herApp, /边缘扩散/);
  assert.match(herApp, /边缘扰动/);
  assert.match(herApp, /鼠标扰动/);
  assert.match(herApp, /漩涡强度/);
  assert.match(herApp, /引力井强度/);
  assert.match(herApp, /湍流强度/);
  assert.match(herApp, /噪声尺度/);
  assert.match(herApp, /吸引／排斥/);
  assert.doesNotMatch(herApp, /Dispersion <|Particle Size <|Flow Speed <|Subject Detail <|Mouse Force </);
  assert.match(particle, /webgl2/);
  assert.match(particle, /imageClarity/);
  assert.match(particle, /imageBase/);
  assert.match(particle, /alpha: true/);
  assert.match(particle, /uniform vec2 uDrag/);
  assert.match(particle, /uniform float uDispersion/);
  assert.match(particle, /uniform float uParticleSize/);
  assert.match(particle, /uniform float uMouseRadius/);
  assert.match(particle, /uniform float uGlowIntensity/);
  assert.match(particle, /uniform float uBloomThreshold/);
  assert.match(particle, /uniform float uEdgeDispersion/);
  assert.match(particle, /uniform float uEdgeDisturbance/);
  assert.match(particle, /uniform float uMouseDisturbance/);
  assert.match(particle, /uniform float uSwirlStrength/);
  assert.match(particle, /uniform float uGravityStrength/);
  assert.match(particle, /uniform float uTurbulence/);
  assert.match(particle, /uniform float uNoiseScale/);
  assert.match(particle, /trailLength/);
  assert.match(particle, /DEFAULT_PARTICLE_TUNING/);
  assert.match(particle, /context\.drawImage\(image, 0, 0, columns, rows\)/);
  assert.match(particle, /imageEnvelope = 1 - smoothstep\(0\.68, 1\.04/);
  assert.match(particle, /haloChance = clamp\(outer \* 0\.44 \+ edge \* \(1 - coreProtection\) \* 0\.32/);
  assert.doesNotMatch(particle, /analyzeSubject|backgroundSuppression|aSubject/);
  assert.match(particle, /pointBudget \* 0\.2/);
  assert.match(particle, /precomposed/);
  assert.match(particle, /trailCanvasRef/);
  assert.match(particle, /destination-out/);
  assert.match(particleStyles, /\.imageBase[\s\S]*?opacity:\s*0;/);
  assert.match(particleStyles, /\.fallback \.imageBase/);
  assert.match(store, /indexedDB/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});
