import {
  getCapabilityStatus,
  getCredentialEnvNames,
  getProviderMode,
  getSelectedProvider,
  hasProviderCredential,
  isLiveCapabilityImplemented,
  listLiveCapabilities,
} from "./env";
import {
  liveAdapterNotImplemented,
  providerNotConfigured,
} from "./errors";
import { MockProvider } from "./mock";
import { LiveQwenImageProvider, LiveTextProvider } from "./live";
import type {
  AsrProvider,
  Capability,
  CapabilityStatus,
  ChatProvider,
  ImageContextProvider,
  MemorySummaryProvider,
  ProviderAvailability,
  TranslationProvider,
  TtsProvider,
} from "./types";
import { PROVIDER_NAMES } from "./types";

type CapabilityAdapter =
  | ChatProvider
  | ImageContextProvider
  | AsrProvider
  | TranslationProvider
  | TtsProvider
  | MemorySummaryProvider;

function getAdapter(
  capability: Capability,
  requestedProvider?: unknown,
): CapabilityAdapter {
  const mode = getProviderMode();
  const provider = getSelectedProvider(capability, requestedProvider);
  if (mode === "mock") return new MockProvider(provider);
  if (!hasProviderCredential(provider)) {
    throw providerNotConfigured(
      capability,
      provider,
      getCredentialEnvNames(provider),
    );
  }
  if (isLiveCapabilityImplemented(capability, provider)) {
    if (capability === "image" && provider === "qwen") {
      return new LiveQwenImageProvider();
    }
    if (
      capability === "chat" ||
      capability === "translation" ||
      capability === "summary"
    ) {
      return new LiveTextProvider(provider, capability);
    }
  }
  throw liveAdapterNotImplemented(capability, provider);
}

export function getChatProvider(provider?: unknown): ChatProvider {
  return getAdapter("chat", provider) as ChatProvider;
}

export function getImageContextProvider(
  provider?: unknown,
): ImageContextProvider {
  return getAdapter("image", provider) as ImageContextProvider;
}

export function getAsrProvider(provider?: unknown): AsrProvider {
  return getAdapter("asr", provider) as AsrProvider;
}

export function getTranslationProvider(
  provider?: unknown,
): TranslationProvider {
  return getAdapter("translation", provider) as TranslationProvider;
}

export function getTtsProvider(provider?: unknown): TtsProvider {
  return getAdapter("tts", provider) as TtsProvider;
}

export function getMemorySummaryProvider(
  provider?: unknown,
): MemorySummaryProvider {
  return getAdapter("summary", provider) as MemorySummaryProvider;
}

export function listCapabilityStatus(): CapabilityStatus[] {
  const capabilities: Capability[] = [
    "chat",
    "image",
    "asr",
    "translation",
    "tts",
    "summary",
  ];
  return capabilities.map((capability) => getCapabilityStatus(capability));
}

export function listProviderAvailability(): ProviderAvailability[] {
  const mode = getProviderMode();
  return PROVIDER_NAMES.map((provider) => {
    const liveCapabilities = listLiveCapabilities(provider);
    return {
      provider,
      mode,
      configured: mode === "mock" || hasProviderCredential(provider),
      mockAvailable: true,
      liveAdapterImplemented: liveCapabilities.length > 0,
      liveCapabilities,
    };
  });
}
