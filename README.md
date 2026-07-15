# Her — AI Memory Garden Demo

这是一个可以本地运行的 AI 语音陪伴产品原型：上传一张图片，让它变成会随声音和指针流动的粒子记忆；围绕图片与 AI 交谈；再把对话保存为记忆卡片并钉到日历。当前版本首先验证完整交互闭环与视觉方向，不是可直接上线的商业成品。

## 先把 Demo 跑起来

准备一台安装了 Node.js `22.13.0` 或更高版本的电脑。推荐使用最新版桌面 Chrome 或 Edge，并开启浏览器硬件加速；粒子画面需要 WebGL2，浏览器语音转写在 Chrome 上的兼容性也相对更好。

在 PowerShell 中运行：

```powershell
cd D:\03_Project\Her
npm ci
npm run dev
```

终端会显示本地地址，通常是 `http://localhost:3000`。如果 3000 端口已被占用，请以终端实际显示的地址为准。保持终端窗口运行，在浏览器中打开该地址即可。

首次安装必须联网下载依赖；依赖安装完成后，默认 `mock` 模式不需要任何大模型 API Key。

## 当前可以体验什么

页面顶部提供五个主要入口：

- **HER / Conversation**：上传 PNG、JPEG 或 WebP 图片并生成 WebGL 粒子画像；支持键盘文字输入、麦克风输入、英文/中文优先、回复翻译、浏览器合成语音重放，以及 `Save Memory` 保存预览。
- **THE GARDEN**：以黑场横向回廊浏览示例图片和本机上传过的图片；中央粒子画像可以重新打开并继续一段对话。
- **MEMORY**：以卡片查看已保存对话、总结、逐轮文字和可用音频；也可以切到 Calendar，把刚保存或当前选中的本地记忆钉到某一天。
- **AI SALON**：从预设话题生成一段多角色英文短对话，并用浏览器中可用的不同合成音色依次播放；支持暂停、继续、重放、更换话题，并可保存为一张 Salon 记忆卡片。
- **MUSIC**：从本机选择一段背景音乐，播放时用音量驱动粒子舞动。当前音乐只服务于这次页面会话，不会自动上传或永久保存。

右上角设置面板可以切换 AI Brain、回复语言、浏览器音色风格、图片理解开关、本机原声保存开关、粒子舞动强度、主体清晰度和鼠标力场强度。

### 麦克风操作

- 短按麦克风会进入“锁定录音”，再次点击结束并提交。
- 长按超过约 0.36 秒后松手，会结束并提交本轮录音。
- 录音中可点击 `cancel` 取消。
- 如果浏览器支持 Web Speech API，录音时会同步显示临时转写；不支持时仍可录音，但当前 Demo 没有云端 ASR 兜底，因而无法可靠得到真实转写。

### 保存一段记忆

完成几轮对话后点击 `Save Memory`。Demo 会先把会话草稿写入本机，再请求总结接口；确认预览后进入 Memory，并可选择日历日期。若总结接口失败，界面会使用保底摘要，已写入的本地草稿不会因此消失。

## 浏览器权限与常见问题

### 麦克风

浏览器第一次录音时会询问麦克风权限，请选择“允许”。麦克风通常只在 `localhost` 或 HTTPS 安全页面可用。若曾拒绝，请在地址栏左侧的网站权限中重新开启，然后刷新页面。

Chrome/Edge 对 `MediaRecorder`、Web Speech API 和浏览器合成语音的支持更完整。Firefox、Safari 或部分移动浏览器可能只能录音而不能实时转写，或提供不同的合成音色。这不是模型故障。

### 图片与音乐

选择图片或音乐只会打开系统文件选择器，不会授予整个文件夹访问权。浏览器通常禁止页面自动播放声音，因此背景音乐和 AI 语音需要由用户点击后启动。

在默认 `mock` 模式下，即使“Let AI understand the image”已开启，图片也只提交给本机同源的模拟接口，不会发给外部模型。切换到 `live` 后，如果该开关开启，上传图片会发送给所配置的 Qwen 图片理解接口；希望图片始终留在本机时，请在上传前关闭此开关。

### 粒子画面

粒子画像依赖 WebGL2 和硬件加速。若画面为空、明显卡顿或浏览器提示 WebGL 不可用，请更新显卡驱动，确认浏览器硬件加速已开启，并优先换用桌面 Chrome/Edge 测试。`prefers-reduced-motion` 开启时，动画会主动减弱。

当前视觉不再显示连续原图底层。上传图片会按设备能力生成约 60,000–280,000 个 WebGL 点，由同一个高密度粒子平面重构主体；中心区域会依据亮度与局部边缘生成 2–4 倍采样点，暗部进行受轮廓约束的结构提亮，并额外生成暖白色勾边粒子。主体使用普通 Alpha 混合保留暗色层次，轮廓和 Halo 才使用 Additive 光效，因此黑色头发、剪影与阴影不再被黑色背景吞掉。径向不规则遮罩使更小的外围粒子柔和扩散，避免留下图片矩形边框。

指针现在是中心排斥、外围切向旋转的黑洞力场，并带亮环与传播波纹；按住大幅拖动时，穹顶点云会逐渐折叠为参考视频里的流体光带，松手后弹性回正。独立时间衰减层继续为鼠标、拖拽、漩涡和声音响应保留光迹。

设置面板已接入参考视频中的真实 Shader 参数：`Dispersion 1.5`、`Particle Size 2.8`、`Contrast 1.3`、`Flow Speed 1.0`、`Flow Amplitude 1.0`、`Depth Strength 50`、`Mouse Radius 110`、`Color Shift Speed 2.0`、`Dance Strength 7.5` 和 `Depth Wave 5.0`。这些滑杆会实时改变粒子位置、大小、颜色、流场、深度和音频舞动，而不是只改变面板文字。

## 本地数据与隐私

图片、Garden 项、会话草稿、记忆卡片、日历日期，以及用户明确选择保存的逐轮录音，保存在当前浏览器站点的 IndexedDB 数据库 `her-device-memory` 中。数据不会自动同步到云端，也不会跨浏览器或跨设备出现。

请注意：

- 勾选“Save my voice on this device”后，用户本轮录音会随记忆保存在本机；当前浏览器生成的 AI 语音没有保存为真实 TTS 音频文件。
- 无痕/隐私窗口、浏览器清理站点数据、卸载浏览器或系统清理工具都可能删除这些记忆。
- 如需清空数据，可在浏览器开发者工具的 Application/Storage 中删除本站 IndexedDB，或通过浏览器“清除网站数据”完成。当前 Demo 尚未提供应用内导出、云备份和一键清空界面。
- 在 `live` 模式下，文字对话、翻译、总结和 AI Salon 内容会发送给所选供应商；开启图片理解后，图片副本会发送给 Qwen。API Key 只应放在服务端环境变量中，绝不能写入前端代码或使用 `NEXT_PUBLIC_*`。

## 默认 mock 模式

仓库默认使用：

```dotenv
HER_PROVIDER_MODE=mock
```

该模式使用可重复的本地模拟响应，不调用 DeepSeek、Qwen、OpenAI、Anthropic 或 Gemini，适合先确认页面流程、粒子表现和保存逻辑。AI 回复、总结、翻译与 Salon 脚本都是演示数据；AI 发声则来自浏览器自己的 `speechSynthesis`，不是任何模型供应商的专属音色。

## 配置 live 文本模型

项目已经为 DeepSeek、Qwen、OpenAI、Anthropic 和 Gemini 保留独立的服务端适配器。当前可进入 `live` 的能力是：

- 五家供应商：Chat、Translation、Summary、AI Salon 文本生成。
- 仅 Qwen：图片理解。
- 尚未接通：任何供应商的实时 ASR 与流式 TTS。

先复制环境变量示例：

```powershell
Copy-Item .env.example .env.local
```

打开 `.env.local`，至少修改以下内容：

```dotenv
HER_PROVIDER_MODE=live

HER_CHAT_PROVIDER=deepseek
HER_TRANSLATION_PROVIDER=qwen
HER_SUMMARY_PROVIDER=deepseek
HER_SALON_PROVIDER=deepseek
HER_IMAGE_PROVIDER=qwen

DEEPSEEK_API_KEY=你的_DeepSeek_Key
DASHSCOPE_API_KEY=你的_阿里云百炼_Key
```

也可以把上述文本能力分别设为 `qwen`、`openai`、`anthropic` 或 `gemini`，并配置对应密钥：

```dotenv
QWEN_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GOOGLE_API_KEY=
```

`DASHSCOPE_API_KEY` 与 `QWEN_API_KEY` 是 Qwen 密钥的两个可接受名称；`GEMINI_API_KEY` 与 `GOOGLE_API_KEY` 同理。只需要填写实际会使用的供应商，不要把真实 Key 提交到 Git。

`.env.example` 还提供：

- `HER_CHAT_MODEL`、`HER_TRANSLATION_MODEL`、`HER_SUMMARY_MODEL`、`HER_SALON_MODEL`、`HER_IMAGE_MODEL`：按能力覆盖模型。
- `DEEPSEEK_MODEL`、`QWEN_MODEL`、`OPENAI_MODEL`、`ANTHROPIC_MODEL`、`GEMINI_MODEL`：按供应商覆盖默认模型。
- 各供应商 `*_BASE_URL`：为区域、Workspace 或代理网关指定地址。
- `HER_PROVIDER_TIMEOUT_MS`：设置上游请求超时，服务端会限制在 5–120 秒之间。

修改环境变量后需要停止并重新运行 `npm run dev`。可在浏览器访问 `/api/providers` 检查服务端看到的模式、已配置供应商和能力状态；该接口不会返回 Key 本身。

仓库没有附带真实 API Key，也没有完成外部账号、额度、地区 Endpoint 或模型可用性的实测。`.env.example` 中的模型名与地址是代码当前默认值，正式使用前仍需按各供应商账号和最新官方文档核对。

## 语音能力的真实边界

当前可交互 Demo 的语音链路是：

```text
浏览器麦克风 / MediaRecorder
        ↓
浏览器 Web Speech API（可用时才有转写）
        ↓
mock 或 live 文本模型
        ↓
浏览器 speechSynthesis 合成语音
```

因此目前还不能宣称已跑通 Qwen 实时 ASR、Qwen/CosyVoice TTS、Gemini TTS、OpenAI Realtime 或其他云端语音服务。`/api/asr/session` 和 `/api/tts/status` 只是统一接口与状态脚手架；在 `live` 模式下会明确报告尚未实现，而不会伪装成成功。浏览器音色只能用于体验节奏和多角色编排，不能作为最终音色验收结果。

## 目录说明

```text
app/
  components/              主界面、记忆视图与 WebGL2 粒子画布
  api/                     Chat、翻译、总结、图片理解、Salon、ASR/TTS 状态接口
  lib/providers/           mock/live Provider 抽象与五家文本模型适配器
  lib/memory/              IndexedDB 数据类型、存储与示例数据
public/demo/               由参考素材整理的本地演示图片
image/                     用户提供的静态参考图
video/                     用户提供的动态交互参考视频
HER_DEMO_EXECUTION_PLAN.md 产品、视觉、语音、数据与执行进度文档
.env.example               无密钥的环境变量模板
```

## 验证命令

```powershell
# 生产构建与 TypeScript/打包检查
npm run build

# ESLint 静态检查
npm run lint
```

视觉和权限仍需人工在真实浏览器中验证：至少测试一次图片上传、鼠标力场、麦克风允许/拒绝、文字输入、`Save Memory`、刷新后的 IndexedDB 恢复、Garden 切换、Memory 日历、AI Salon 暂停/重放，以及本地音乐播放。参考视频没有提供原始 Shader、音频或专属音色元数据，所以当前版本不应被描述为已经完成 1:1 视觉验收。

更完整的范围、术语解释、技术选型、视频分析和后续任务见 [HER_DEMO_EXECUTION_PLAN.md](./HER_DEMO_EXECUTION_PLAN.md)。
