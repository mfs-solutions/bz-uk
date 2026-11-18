import { isUKCountry } from "../../../src/config/market.ts";

const euCountries = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

type Country = {
  country_name: string | null;
  country_code: string | null;
  short_code: string | null;
  iso2: string | null;
};

const normalize = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export function resolveHostedMarket(country: string, countryCode: string, countries: Country[]) {
  if (isUKCountry(country)) {
    return { country: "United Kingdom", currency: "GBP" as const };
  }
  const token = normalize(country);
  const matches = countries.filter((row) =>
    [row.country_name, row.country_code, row.short_code, row.iso2]
      .some((value) => value && normalize(value) === token)
  );
  if (matches.length !== 1) throw new Error("Unsupported or ambiguous delivery country");
  const row = matches[0];
  const iso = String(row.iso2 || "").toUpperCase();
  if (countryCode && ![row.country_name, row.country_code, row.short_code, row.iso2]
    .some((value) => value && normalize(value) === normalize(countryCode))) {
    throw new Error("Country and country code do not match");
  }
  if (!row.country_name || (!euCountries.has(iso) && iso !== "US")) {
    throw new Error("Unsupported delivery country");
  }
  return { country: row.country_name, currency: iso === "US" ? "USD" as const : "EUR" as const };
}

export function isHostedCurrency(currency: unknown): currency is "gbp" | "eur" | "usd" {
  return currency === "gbp" || currency === "eur" || currency === "usd";
}
