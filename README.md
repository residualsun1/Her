<p align="center">
  <img src="./public/brand/her-icon.png" width="180" alt="Her project icon" />
</p>

# Her

Her 是一个以图像记忆为入口的中文 AI 语音陪伴产品。用户可以上传照片，将其转化为可交互的粒子画面；模型结合用户主动提供的图片语境展开对话，并把完成的对话保存为可沉浸阅读的记忆。

当前版本已部署并持续迭代，核心闭环包括：

- 图片上传、粒子化呈现与鼠标/音乐响应
- 基于 Qwen 的中文图像理解、对话与记忆总结
- `qwen-audio-3.0-tts-plus` 流式语音合成
- 浏览器语音识别、停顿标点与录音交互
- 记忆保存、删除、回廊阅读和日历固定
- 默认背景音乐、`.mp3` / `.flac` 本地音乐列表与粒子联动

## 快速开始

需要 Node.js 22.13 或更高版本。

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

默认配置为 `mock`，不需要 API Key。使用真实模型时，在 `.env.local` 中配置：

```dotenv
HER_PROVIDER_MODE=live
HER_CHAT_PROVIDER=qwen
HER_SUMMARY_PROVIDER=qwen
HER_IMAGE_PROVIDER=qwen
HER_TTS_PROVIDER=qwen

DASHSCOPE_API_KEY=你的服务端密钥
QWEN_BASE_URL=你的百炼工作空间域名/compatible-mode/v1
```

真实密钥只能保存在本地或部署平台的服务端环境变量中，不能使用 `NEXT_PUBLIC_*`，也不能提交到 Git。

## 架构

```text
app/
  api/                     服务端能力边界：Chat、图片理解、总结、ASR、TTS
  components/
    her-app/               主产品的共享类型、纯工具与独立视图
    HerApp.tsx             产品状态编排和页面组合
    ParticleGarden.tsx     粒子场景装配与降级呈现
    GpuParticleField.tsx   WebGL/GPU 粒子模拟
  lib/
    memory/                IndexedDB 数据模型、仓储与示例数据
    providers/             模型路由、mock/live 适配器与错误边界
build/                     Sites 构建元数据插件
worker/                    Cloudflare Worker 入口
public/                    演示图片与社交预览资源
tests/                     构建产物与关键产品契约测试
```

架构按四层组织：

1. `components` 只处理界面、交互状态和浏览器能力。
2. `api` 校验输入并隔离客户端与模型密钥。
3. `lib/providers` 统一不同模型供应商的能力契约。
4. `lib/memory` 负责设备本地的数据持久化，不与模型调用耦合。

目前记忆、图片和用户选择保存的录音存储在浏览器 IndexedDB `her-device-memory` 中。它们不会自动跨设备同步，清除网站数据也会清除这些记忆。项目内置的默认音乐位于 `public/audio/`，浏览器只按需加载；用户自行添加的背景音乐只在当前页面使用，不上传、不持久化。公开发布或分发内置音乐前，需要确认拥有相应使用权。

## 实现栈

Demo 的实现栈如下：

* 在前端技术栈上，主要选取了 React / TypeScript / WebGL
  * React 负责页面组件、交互状态和产品界面
  * Typescript 负责前后端代码的静态约束类型
  * WebGL 负责 GPU 粒子模拟与实时渲染
* 产品 AI 能力实现方向上，我主要选择了 Qwen
  * Qwen 是我目前所能找到的最符合中文语境且相对符合理想音色期望的大模型，负责图像理解、对话、记忆总结和 TTS
* 由于本项目仍然是 Demo，因此选择 IndexedDB 管理本地数据层
  * IndexeDB 用于在用户浏览器中保存记忆、图片、会话和录音
* 服务端与部署层面，我选择 Cloudflare Workers
  * Cloudflare Workers 是生产环境服务端运行时、静态资源和 API 入口

已经实现的进度如下：

* 跑通图片上传、多模态理解、中文对话、语音合成、会话总结与本地记忆保存
* 使用 WebGL 粒子画面、声音响应和沉浸模式建立区别于普通聊天框的交互语言
* 使用 Qwen 承担生产环境中的图片理解、对话、总结和语音合成，并保留无 API Key 也可运行的 Mock 模式
* 将模型密钥隔离在服务端，记忆默认保存在用户设备的 IndexedDB 中，同时明确云端模型能力仍会产生数据传输
* 部署到 Cloudflare Workers，并通过 GitHub 保留完整版本历史
* 建立 3 组 smoke / contract tests，覆盖服务端渲染、Mock API 和关键产品交互契约

## AI 与工程架构

我将前端交互、服务端能力、模型适配和本地记忆拆成四层：

```text label="产品与模型架构"
浏览器
├─ React：页面、状态与语音交互
├─ WebGL / React Three Fiber：粒子记忆
├─ Web Audio：音乐与语音能量分析
└─ IndexedDB：本地记忆、图片与可选录音
             ↓
Cloudflare Worker API
├─ /api/image-context：图片理解
├─ /api/chat：流式对话
├─ /api/summary：记忆整理
└─ /api/tts/synthesize：流式语音合成
             ↓
Provider 适配层
├─ Live：生产环境真实模型
└─ Mock：无密钥、可重复的离线演示
```

生产链路当前使用 Qwen 完成图片理解、对话、总结与 TTS，语音识别则依赖浏览器 `SpeechRecognition`。代码中已经为 Qwen、DeepSeek、OpenAI、Anthropic 和 Gemini 建立文本能力适配层，但这五家模型还没有都经过生产验证。

几项关键工程边界包括：

- API Key 只由服务端环境变量读取，不返回浏览器
- 图片、对话和语音请求都有输入大小、长度与上游超时限制
- 真模型不可用时显示明确的降级信息，不把本地 Mock 伪装成调用成功
- Mock 模式不需要 API Key，方便开发、演示和自动化测试
- 记忆、图片和开启保存后的录音留在设备中，清除网站数据时也会被一并清除
- 当前图像理解与原声保存都默认为开启，数据说明和主动同意流程仍需补齐

## 模型与隐私边界

- 图片只有在用户开启“允许 AI 理解图片”后，才会发送压缩副本。
- 图像分析只描述可见内容和低置信度氛围线索，不把外观推断为用户真实情绪。
- API Key 仅由服务端适配器读取，不会返回到浏览器。
- 对话、图片理解和 TTS 请求均设置输入长度与上游超时边界。
- 云端模型不可用时，产品保留明确的本地降级提示，不伪装为调用成功。

## 验证与发布

```powershell
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
```

`npm test` 会先完成生产构建，再检查服务端渲染、mock 接口和关键交互契约。项目通过 `.openai/hosting.json` 绑定 Sites；每次发布对应一个 Git 提交和一个可回溯版本，因此上线不会阻止后续协作，新的修改仍按“开发、验证、提交、发布”的流程迭代。

公开生产环境使用 Cloudflare Workers，`wrangler.jsonc` 是唯一的 Worker 运行配置源；`.openai/hosting.json` 保留为 Sites 私有版本与回滚通道。首次连接 Cloudflare 后，可以执行：

公开地址：<https://memoryhere.live>

```powershell
npx vinext deploy --name her
npx wrangler secret bulk .env.local --name her
```

仅在环境变量发生变化时重新同步机密。`.env.local` 始终只保存在本地，不进入 Git。
