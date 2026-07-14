import type { Capability, ProviderName } from "./types";

export class ProviderError extends Error {
  readonly code: string;
  readonly status: number;
  readonly capability?: Capability;
  readonly provider?: ProviderName;
  readonly hint?: string;

  constructor(options: {
    code: string;
    message: string;
    status: number;
    capability?: Capability;
    provider?: ProviderName;
    hint?: string;
  }) {
    super(options.message);
    this.name = "ProviderError";
    this.code = options.code;
    this.status = options.status;
    this.capability = options.capability;
    this.provider = options.provider;
    this.hint = options.hint;
  }
}

export function invalidRequest(message: string): ProviderError {
  return new ProviderError({
    code: "INVALID_REQUEST",
    message,
    status: 400,
  });
}

export function providerNotConfigured(
  capability: Capability,
  provider: ProviderName,
  credentialNames: string[],
): ProviderError {
  return new ProviderError({
    code: "PROVIDER_NOT_CONFIGURED",
    message: `${provider} is selected for ${capability}, but no server credential is configured.`,
    status: 503,
    capability,
    provider,
    hint: `Configure one of ${credentialNames.join(" or ")}, or set HER_PROVIDER_MODE=mock for the offline demo.`,
  });
}

export function liveAdapterNotImplemented(
  capability: Capability,
  provider: ProviderName,
): ProviderError {
  return new ProviderError({
    code: "LIVE_ADAPTER_NOT_IMPLEMENTED",
    message: `The live ${capability} adapter for ${provider} has not been connected yet.`,
    status: 501,
    capability,
    provider,
    hint:
      "Add the provider-specific adapter and its official endpoint contract. No fallback provider was contacted.",
  });
}

export function upstreamProviderError(options: {
  capability: Capability;
  provider: ProviderName;
  status?: number;
  detail?: string;
}): ProviderError {
  const suffix = options.status ? ` (HTTP ${options.status})` : "";
  return new ProviderError({
    code: "UPSTREAM_PROVIDER_ERROR",
    message: `${options.provider} could not complete the ${options.capability} request${suffix}.`,
    status: 502,
    capability: options.capability,
    provider: options.provider,
    hint:
      options.detail ??
      "Check the provider key, model name, region/base URL, quota, and provider status.",
  });
}
