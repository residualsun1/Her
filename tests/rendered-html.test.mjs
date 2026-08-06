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
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const html = await response.text();

  assert.match(html, /<title>Her — AI 记忆花园<\/title>/i);
  assert.match(html, />记忆</);
  assert.match(html, /留住记忆/);
  assert.match(html, /这张照片里有一种温柔/);
  assert.doesNotMatch(html, /AI Salon/i);
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
      message: "这张图片让我想起家。",
      provider: "deepseek",
      replyLanguage: "zh",
    }),
  });
  assert.equal(chatResponse.status, 200);
  const chat = await chatResponse.json();
  assert.equal(chat.mock, true);
  assert.equal(chat.provider, "deepseek");
  assert.ok(chat.text.length > 20);

  const imageResponse = await request("/api/image-context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      consent: true,
      language: "zh",
      image: {
        name: "winter.jpg",
        mimeType: "image/jpeg",
        width: 1200,
        height: 800,
      },
    }),
  });
  assert.equal(imageResponse.status, 200);
  const imageContext = await imageResponse.json();
  assert.ok(imageContext.description.length > 10);
  assert.ok(imageContext.openingQuestion.includes("？"));
  assert.ok(Array.isArray(imageContext.atmosphereHypotheses));
  assert.ok(imageContext.atmosphereHypotheses.length > 0);
  assert.equal(imageContext.mood, undefined);

  const rejectedImage = await request("/api/image-context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      consent: true,
      image: { mimeType: "image/svg+xml", sizeBytes: 100 },
    }),
  });
  assert.equal(rejectedImage.status, 400);
});

test("product modules and critical interaction contracts are present", async () => {
  const [page, layout, packageJson, viteConfig, wranglerConfig, herApp, herUtils, calendarPanel, particle, gpu, particleConfig, particleStyles, appStyles, store, providerEnv, liveProvider, ttsRoute, worker] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("vite.config.ts", root), "utf8"),
    readFile(new URL("wrangler.jsonc", root), "utf8"),
    readFile(new URL("app/components/HerApp.tsx", root), "utf8"),
    readFile(new URL("app/components/her-app/utils.ts", root), "utf8"),
    readFile(new URL("app/components/her-app/CalendarPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/ParticleGarden.tsx", root), "utf8"),
    readFile(new URL("app/components/GpuParticleField.tsx", root), "utf8"),
    readFile(new URL("app/components/particleConfig.ts", root), "utf8"),
    readFile(new URL("app/components/ParticleGarden.module.css", root), "utf8"),
    readFile(new URL("app/components/HerApp.module.css", root), "utf8"),
    readFile(new URL("app/lib/memory/store.ts", root), "utf8"),
    readFile(new URL("app/lib/providers/env.ts", root), "utf8"),
    readFile(new URL("app/lib/providers/live.ts", root), "utf8"),
    readFile(new URL("app/api/tts/synthesize/route.ts", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
  ]);
  const [monoLineBeam, monoLineBeamStyles] = await Promise.all([
    readFile(new URL("app/components/MonoLineBeam.tsx", root), "utf8"),
    readFile(new URL("app/components/MonoLineBeam.module.css", root), "utf8"),
  ]);

  assert.match(page, /<HerApp \/>/);
  assert.match(layout, /AI 记忆花园/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /@react-three\/fiber/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /drizzle|tailwindcss|eslint-config-next|"next"/);
  assert.match(viteConfig, /sites\(\)/);
  assert.match(viteConfig, /cloudflare\(\{/);
  assert.doesNotMatch(viteConfig, /localBindingConfig|compatibility_flags/);
  const workerDeployment = JSON.parse(wranglerConfig);
  assert.equal(workerDeployment.name, "her");
  assert.equal(workerDeployment.workers_dev, true);
  assert.equal(workerDeployment.preview_urls, false);
  assert.deepEqual(workerDeployment.compatibility_flags, ["nodejs_compat"]);
  assert.match(calendarPanel, /aria-label="上个月"/);
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
  assert.match(herApp, /handleParticleWheel/);
  assert.match(herApp, /smoothingTimeConstant = 0\.76/);
  assert.match(herApp, /average \* 1\.15 \+ bass \* 0\.62/);
  assert.match(herApp, /主体音乐律动/);
  assert.match(herApp, /音乐列表/);
  assert.match(herApp, /const DEFAULT_MUSIC_TRACK[\s\S]*?Song On The Beach[\s\S]*?\/audio\/song-on-the-beach\.mp3/);
  assert.match(herApp, /useState<MusicTrack\[\]>\(\[DEFAULT_MUSIC_TRACK\]\)/);
  assert.match(herApp, /preload="metadata"/);
  assert.match(herApp, /\.mp3,.flac/);
  assert.match(herApp, /aria-label="上传更多图片"[\s\S]*?aria-hidden="true">↥/);
  assert.match(herApp, /deleteMemoryButton[\s\S]*?aria-hidden="true">×/);
  assert.match(herApp, /cardDeleteButton[\s\S]*?aria-hidden="true">×/);
  assert.match(herApp, /className=\{styles\.openGardenButton\}[\s\S]*?openGardenConversation\(item\)/);
  assert.doesNotMatch(herApp, /deleteMemoryButton[\s\S]{0,500}?onPointerUp/);
  assert.match(herApp, /const openGardenConversation[\s\S]*?primeSpeechPlayback\(\);[\s\S]*?speak\(welcome,/);
  assert.match(herApp, /setDeleteTarget\(\{ kind: "garden"[\s\S]*?删除当前记忆/);
  assert.match(appStyles, /\.openGardenButton \{[\s\S]*?z-index: 10/);
  assert.doesNotMatch(herApp, /＋ 上传更多/);
  assert.doesNotMatch(herApp, /salon/i);
  assert.doesNotMatch(herApp, /api\/translate|点击翻译/);
  assert.doesNotMatch(herApp, /replyActions/);
  assert.match(appStyles, /\.replySpeaking \.miniWave i[\s\S]*?--voice-amplitude/);
  assert.match(herApp, /\/api\/tts\/synthesize/);
  assert.match(herApp, /decodeAudioData/);
  assert.match(herApp, /getByteFrequencyData/);
  assert.match(herApp, /const stopListening[\s\S]*?const blobPromise = stopRecorder\(\);[\s\S]*?getTracks\(\)\.forEach[\s\S]*?primeSpeechPlayback\(\);[\s\S]*?await blobPromise/);
  assert.match(herApp, /await resumeAudioContext\(context\)/);
  assert.match(appStyles, /\.replyCard \{[\s\S]*?background: transparent/);
  assert.match(appStyles, /--silver: #e7e8ea/);
  assert.doesNotMatch(appStyles, /#89f5cf|137,\s*245,\s*207/);
  assert.match(appStyles, /\.galleryPage \.uploadMore \{[\s\S]*?bottom: 22px;[\s\S]*?left: 50%/);
  assert.match(herApp, /immersiveMode/);
  assert.match(herApp, /隐藏界面/);
  assert.match(herApp, /显示界面（Esc）/);
  assert.match(appStyles, /\.immersiveStage \.conversationTimer,[\s\S]*?animation: none !important/);
  assert.match(herApp, /USER_WORDS_HOLD_MS = 2_000/);
  assert.match(herApp, /const replyPromise = \(async \(\) => \{[\s\S]*?fetch\("\/api\/chat"[\s\S]*?prepareSynthesizedSpeech\(text, "zh", true\)[\s\S]*?setSentEcho\(message\)[\s\S]*?USER_WORDS_HOLD_MS/);
  assert.match(herApp, /className=\{styles\.sentEcho\}/);
  assert.match(herApp, /const speak = useCallback[\s\S]*?setReplyState\("thinking"\)[\s\S]*?source\.start\(context\.currentTime \+ 0\.06\)/);
  assert.match(herApp, /const playStreamingPcm[\s\S]*?getInt16\(index \* 2, true\)[\s\S]*?reader\.read\(\)/);
  assert.match(herApp, /preferStreaming && response\.body[\s\S]*?kind: "pcm-stream"/);
  assert.match(herApp, /!sentEcho && replyState !== "holding" && replyState !== "thinking" && currentAssistant/);
  assert.match(herApp, /speak\(welcome, undefined, 0, "zh", undefined, \(\) => \{[\s\S]*?setConversationChromeVisible\(true\)/);
  assert.match(herApp, /speak\(text, undefined, 0, "zh", preparedAudio\)/);
  assert.match(appStyles, /@keyframes userWordsIn/);
  assert.match(herUtils, /formatSpeechRecognitionResults[\s\S]*?result\.isFinal[\s\S]*?"，"/);
  assert.match(herUtils, /finishSpeechTranscript[\s\S]*?replace\([\s\S]*?"。"/);
  assert.match(herApp, /recognition\.onresult[\s\S]*?formatSpeechRecognitionResults\(event\.results\)/);
  assert.match(herApp, /history: turns\.slice\(-10\)/);
  assert.doesNotMatch(herApp, /history: nextTurns\.slice/);
  assert.match(herApp, /setReadingCard\(card\)/);
  assert.match(herApp, /className=\{styles\.memoryReaderBackdrop\}[\s\S]*?完整对话/);
  assert.match(appStyles, /\.memoryReaderBackdrop \{[\s\S]*?position: fixed;[\s\S]*?z-index: 70/);
  assert.match(liveProvider, /Never repeat, quote, paraphrase, or restate an earlier assistant reply/);
  assert.match(liveProvider, /removeRepeatedAssistantLead\(completion\.text, previousAssistant\)/);
  assert.match(liveProvider, /"X-DashScope-SSE": "enable"/);
  assert.match(liveProvider, /format: "pcm"/);
  assert.match(liveProvider, /decodeQwenSseAudio/);
  assert.match(liveProvider, /maxTokens: 240/);
  assert.match(ttsRoute, /format: streaming \? "pcm16" : "wav"/);
  assert.match(ttsRoute, /X-Her-TTS-Sample-Rate/);
  assert.match(worker, /API_RATE_LIMITS/);
  assert.match(worker, /RATE_LIMITED/);
  assert.doesNotMatch(herApp, /预览 AI|上传另一张图片|保存记忆/);
  assert.match(herApp, /conversationTimer[\s\S]*?formatClock\(elapsed\)/);
  assert.match(herApp, /uploadMemoryButton[\s\S]*?aria-label="上传图片"/);
  assert.match(herApp, /留住记忆/);
  assert.equal((herApp.match(/<MonoLineBeam/g) ?? []).length, 5);
  assert.match(herApp, /className=\{styles\.inputBeam\}[\s\S]*?className=\{`\$\{styles\.inputBar\}/);
  assert.match(herApp, /className=\{`\$\{styles\.replyPosition\}[\s\S]*?<MonoLineBeam/);
  assert.match(monoLineBeam, /data-beam-type="line"/);
  assert.match(monoLineBeam, /data-beam-color="mono"/);
  assert.match(monoLineBeam, /data-beam-strength="0\.7"/);
  assert.match(monoLineBeamStyles, /animation: monoLineBeam 3\.1s linear infinite/);
  assert.match(monoLineBeamStyles, /32\.5% \{[\s\S]*?opacity: 0\.7/);
  assert.match(appStyles, /\.sessionBeam \{[\s\S]*?height: 38px;[\s\S]*?border-radius: 12px/);
  assert.match(herApp, /immersiveIcon[\s\S]*?<i \/><i \/><i \/><i \/>/);
  assert.doesNotMatch(herApp, /<span>\{immersiveMode \? "显示界面" : "隐藏界面"\}<\/span>/);
  assert.doesNotMatch(appStyles, /\.immersiveStage \.immersiveToggle small \{[\s\S]*?display: none/);
  assert.match(appStyles, /\.gardenQuestion \{[\s\S]*?right: 2\.2vw;[\s\S]*?width: min\(390px, 32vw\)/);
  assert.match(appStyles, /\.gardenQuestion \.replyCard > p \{[\s\S]*?font-size: clamp\(15px, 1\.35vw, 19px\)/);
  assert.match(providerEnv, /chat: "qwen"/);
  assert.match(providerEnv, /summary: "qwen"/);
  assert.match(providerEnv, /qwen3\.7-plus/);
  assert.match(providerEnv, /parsed\.pathname = "\/compatible-mode\/v1"/);
  assert.match(liveProvider, /atmosphereHypotheses/);
  assert.match(liveProvider, /never as the user's actual emotional state/);
  assert.match(herApp, /openingQuestion/);
  assert.match(herApp, /gardenWheelLockRef/);
  assert.match(herApp, /if \(gardenDragRef\.current\.moved\)/);
  assert.doesNotMatch(herApp, /suppressGardenOpenUntilRef/);
  assert.doesNotMatch(herApp, /openGardenConversation\(item,\s*event\.timeStamp\)/);
  const gardenPointerDown = herApp.match(/const handleGardenPointerDown[\s\S]*?(?=\n {2}const handleGardenPointerMove)/)?.[0] ?? "";
  const gardenPointerMove = herApp.match(/const handleGardenPointerMove[\s\S]*?(?=\n {2}const settleGardenSelection)/)?.[0] ?? "";
  assert.doesNotMatch(gardenPointerDown, /setPointerCapture/);
  assert.match(gardenPointerMove, /setPointerCapture/);
  assert.match(herApp, /if \(!moved && mode === "artwork"\) return/);
  assert.match(herApp, /closest\(`\.\$\{styles\.deleteMemoryButton\}`\)\) return/);
  assert.match(herApp, /className=\{styles\.deleteMemoryButton\}[\s\S]*?onClick=\{\(event\) => \{[\s\S]*?setDeleteTarget\(\{ kind: "garden", item \}\)/);
  assert.match(appStyles, /\.deleteMemoryButton,[\s\S]*?width: 44px;[\s\S]*?height: 44px/);
  assert.doesNotMatch(herApp, /onScroll=\{\(event\) => settleGardenSelection/);
  assert.doesNotMatch(herApp, /Dispersion <|Particle Size <|Flow Speed <|Subject Detail <|Mouse Force </);
  assert.match(particle, /@react-three\/fiber/);
  assert.match(particle, /r3f-fbo/);
  assert.match(particle, /debouncedCount/);
  assert.match(particle, /imageClarity/);
  assert.doesNotMatch(particle, /className=\{styles\.imageBase\}/);
  assert.match(particle, /preserveDrawingBuffer/);
  assert.match(particle, /precomposed/);
  assert.match(gpu, /WebGLRenderTarget/);
  assert.match(gpu, /sobelEdge/);
  assert.match(gpu, /curlNoise/);
  assert.match(gpu, /uSubjectRhythmStrength/);
  assert.match(gpu, /subjectBreath/);
  assert.doesNotMatch(gpu, /dreamReleaseZone|coherentPlume|plumeSelector/);
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
  assert.match(gpu, /uSurfaceLayer/);
  assert.match(gpu, /uImageClarity/);
  assert.match(gpu, /uZoom/);
  assert.match(gpu, /surfaceMaterial/);
  assert.match(gpu, /rotateField/);
  assert.match(gpu, /rotationTargetRef/);
  assert.match(gpu, /centerTrough/);
  assert.match(gpu, /raisedRim/);
  assert.match(gpu, /flowWeight = 0\.018/);
  assert.doesNotMatch(gpu, /TEXTURE_CORE_FRAGMENT|textureCoreMaterial/);
  assert.match(gpu, /contentBounds/);
  assert.match(gpu, /smoothstep\(0\.38, 1\.0, age\)/);
  assert.match(particleConfig, /particleCount: 262_144/);
  assert.match(particleConfig, /particleSize: 2\.8/);
  assert.match(particleConfig, /depthStrength: 50/);
  assert.match(particleConfig, /subjectRhythmStrength: 0\.55/);
  assert.match(particleConfig, /danceStrength: 7\.5/);
  assert.match(particleConfig, /audioBrightnessStrength: 0\.55/);
  assert.match(particleConfig, /audioAttack: 0\.045/);
  assert.match(particleConfig, /audioRelease: 0\.28/);
  assert.match(particleConfig, /reactTarget: "peel"/);
  assert.doesNotMatch(particleStyles, /\.ready \.imageBase/);
  assert.match(appStyles, /\.parameterNote/);
  assert.match(particleStyles, /\.canvas[\s\S]*opacity: 1/);
  assert.match(store, /indexedDB/);
  await access(new URL("public/audio/song-on-the-beach.mp3", root));
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});
