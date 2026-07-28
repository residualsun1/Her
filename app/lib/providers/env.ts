import { ProviderError } from "./errors";
import {
  PROVIDER_NAMES,
  type Capability,
  type CapabilityStatus,
  type ProviderMode,
  type ProviderName,
} from "./types";

const DEFAULT_PROVIDERS: Record<Capability, ProviderName> = {
  chat: "deepseek",
  image: "qwen",
  asr: "qwen",
  tts: "qwen",
  summary: "deepseek",
};

const PROVIDER_ENV: Record<Capability, string> = {
  chat: "HER_CHAT_PROVIDER",
  image: "HER_IMAGE_PROVIDER",
  asr: "HER_ASR_PROVIDER",
  tts: "HER_TTS_PROVIDER",
  summary: "HER_SUMMARY_PROVIDER",
};

const MODEL_ENV: Record<Capability, string> = {
  chat: "HER_CHAT_MODEL",
  image: "HER_IMAGE_MODEL",
  asr: "HER_ASR_MODEL",
  tts: "HER_TTS_MODEL",
  summary: "HER_SUMMARY_MODEL",
};

const CREDENTIAL_ENV: Record<ProviderName, string[]> = {
  deepseek: ["DEEPSEEK_API_KEY"],
  qwen: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

const DEFAULT_LIVE_MODELS: Record<ProviderName, string> = {
  deepseek: "deepseek-v4-flash",
  qwen: "qwen-plus",
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
};

const PROVIDER_MODEL_ENV: Record<ProviderName, string> = {
  deepseek: "DEEPSEEK_MODEL",
  qwen: "QWEN_MODEL",
  openai: "OPENAI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  gemini: "GEMINI_MODEL",
};

const BASE_URL_ENV: Record<ProviderName, string[]> = {
  deepseek: ["DEEPSEEK_BASE_URL"],
  qwen: ["QWEN_BASE_URL", "DASHSCOPE_BASE_URL"],
  openai: ["OPENAI_BASE_URL"],
  anthropic: ["ANTHROPIC_BASE_URL"],
  gemini: ["GEMINI_BASE_URL"],
};

const DEFAULT_BASE_URLS: Record<ProviderName, string> = {
  deepseek: "https://api.deepseek.com",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

const TEXT_CAPABILITIES = new Set<Capability>([
  "chat",
  "summary",
]);

export function envValue(name: string): string | undefined {
  // Keeping access in this server-only module prevents credentials from being
  // serialized into route responses or imported by client components.
  const value = process.env[name];
  return value?.trim() || undefined;
}

export function isProviderName(value: unknown): value is ProviderName {
  return (
    typeof value === "string" &&
    (PROVIDER_NAMES as readonly string[]).includes(value.toLowerCase())
  );
}

export function getProviderMode(): ProviderMode {
  const value = envValue("HER_PROVIDER_MODE")?.toLowerCase() ?? "mock";
  if (value === "mock" || value === "live") return value;
  throw new ProviderError({
    code: "INVALID_SERVER_CONFIGURATION",
    message: "HER_PROVIDER_MODE must be either mock or live.",
    status: 500,
    hint: "Use mock for the deterministic offline demo.",
  });
}

export function getSelectedProvider(
  capability: Capability,
  requested?: unknown,
): ProviderName {
  if (requested !== undefined && requested !== null && requested !== "") {
    if (!isProviderName(requested)) {
      throw new ProviderError({
        code: "UNSUPPORTED_PROVIDER",
        message: `Unsupported provider: ${String(requested)}.`,
        status: 400,
        capability,
        hint: `Choose one of: ${PROVIDER_NAMES.join(", ")}.`,
      });
    }
    return requested.toLowerCase() as ProviderName;
  }

  const configured = envValue(PROVIDER_ENV[capability]);
  if (!configured) return DEFAULT_PROVIDERS[capability];
  if (!isProviderName(configured)) {
    throw new ProviderError({
      code: "INVALID_SERVER_CONFIGURATION",
      message: `${PROVIDER_ENV[capability]} contains an unsupported provider.`,
      status: 500,
      capability,
      hint: `Choose one of: ${PROVIDER_NAMES.join(", ")}.`,
    });
  }
  return configured.toLowerCase() as ProviderName;
}

export function getCredentialEnvNames(provider: ProviderName): string[] {
  return CREDENTIAL_ENV[provider];
}

export function hasProviderCredential(provider: ProviderName): boolean {
  return CREDENTIAL_ENV[provider].some((name) => Boolean(envValue(name)));
}

export function getProviderCredential(provider: ProviderName): string | null {
  for (const name of CREDENTIAL_ENV[provider]) {
    const value = envValue(name);
    if (value) return value;
  }
  return null;
}

export function getProviderBaseUrl(provider: ProviderName): string {
  const configured = BASE_URL_ENV[provider]
    .map(envValue)
    .find((value): value is string => Boolean(value));
  return (configured ?? DEFAULT_BASE_URLS[provider]).replace(/\/+$/, "");
}

export function isLiveCapabilityImplemented(
  capability: Capability,
  provider: ProviderName,
): boolean {
  if (TEXT_CAPABILITIES.has(capability)) return true;
  return capability === "image" && provider === "qwen";
}

export function listLiveCapabilities(provider: ProviderName): Capability[] {
  const capabilities: Capability[] = [
    "chat",
    "image",
    "asr",
    "tts",
    "summary",
  ];
  return capabilities.filter((capability) =>
    isLiveCapabilityImplemented(capability, provider),
  );
}

export function getConfiguredModel(
  capability: Capability,
  mode = getProviderMode(),
  provider = getSelectedProvider(capability),
): string | null {
  if (mode === "mock") return "her-deterministic-mock-v1";
  const capabilityOverride = envValue(MODEL_ENV[capability]);
  if (capabilityOverride) return capabilityOverride;
  if (capability === "image" && provider === "qwen") {
    return envValue("QWEN_IMAGE_MODEL") ?? "qwen-vl-plus";
  }
  if (!isLiveCapabilityImplemented(capability, provider)) return null;
  return envValue(PROVIDER_MODEL_ENV[provider]) ?? DEFAULT_LIVE_MODELS[provider];
}

export function getCapabilityStatus(
  capability: Capability,
  requested?: unknown,
): CapabilityStatus {
  const mode = getProviderMode();
  const provider = getSelectedProvider(capability, requested);
  const configured = mode === "mock" || hasProviderCredential(provider);
  const implemented =
    mode === "mock" || isLiveCapabilityImplemented(capability, provider);
  return {
    capability,
    provider,
    mode,
    configured,
    implemented,
    model: getConfiguredModel(capability, mode, provider),
    reason:
      mode === "mock"
        ? "Deterministic offline adapter"
        : !implemented
          ? "Live adapter is not implemented for this capability/provider pair"
          : configured
            ? "Live server adapter ready"
            : "Server credential missing",
  };
}
