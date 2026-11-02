export const CHECKOUT_URL = "https://sitespellchecker.com/site-scans/checkout";
export const PRIVACY_URL = "https://sitespellchecker.com/privacy";
export const TERMS_URL = "https://sitespellchecker.com/terms";

export const CHECKOUT_REF = "webflow-app";
export const CHECKOUT_UTM_SOURCE = "webflow";
export const CHECKOUT_UTM_MEDIUM = "app";
export const CHECKOUT_UTM_CAMPAIGN = "designer-extension";

export interface SiteDomainSource {
  shortName?: string;
  domains?: Array<{
    url: string;
    default?: boolean;
    stage?: "staging" | "production";
  }>;
}

export function hostnameFromUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withProtocol).hostname;
  } catch {
    return "";
  }
}

function preferredDomain(
  domains: NonNullable<SiteDomainSource["domains"]>,
): { url: string } | undefined {
  return domains.find((domain) => domain.default) ?? domains[0];
}

export function pickSiteDomain(info: SiteDomainSource): string {
  const domains = info.domains ?? [];
  const chosen =
    preferredDomain(domains.filter((domain) => domain.stage === "production")) ??
    preferredDomain(domains.filter((domain) => domain.stage === "staging")) ??
    preferredDomain(domains);
  if (chosen) {
    const host = hostnameFromUrl(chosen.url);
    if (host) {
      return host;
    }
  }
  const shortName = (info.shortName ?? "").trim();
  return shortName ? `${shortName}.webflow.io` : "";
}

export function buildCheckoutUrl(domain: string): string {
  const url = new URL(CHECKOUT_URL);
  if (domain) {
    url.searchParams.set("domain", domain);
  }
  url.searchParams.set("ref", CHECKOUT_REF);
  url.searchParams.set("utm_source", CHECKOUT_UTM_SOURCE);
  url.searchParams.set("utm_medium", CHECKOUT_UTM_MEDIUM);
  url.searchParams.set("utm_campaign", CHECKOUT_UTM_CAMPAIGN);
  return url.toString();
}
