import { deepStrictEqual, equal, throws } from "node:assert/strict";
import { isHostedCurrency, resolveHostedMarket } from "./hosted-checkout-market.ts";

const countries = [
  { country_name: "France", country_code: "FRA", short_code: "FR", iso2: "FR" },
  { country_name: "Poland", country_code: "POL", short_code: "PL", iso2: "PL" },
  { country_name: "United States", country_code: "USA", short_code: "US", iso2: "US" },
  { country_name: "Norway", country_code: "NOR", short_code: "NO", iso2: "NO" },
];

Deno.test("hosted checkout preserves GBP and maps EU and US currencies", () => {
  deepStrictEqual(resolveHostedMarket("United Kingdom", "GB", countries), { country: "United Kingdom", currency: "GBP" });
  deepStrictEqual(resolveHostedMarket("United Kingdom", "US", countries), { country: "United Kingdom", currency: "GBP" });
  deepStrictEqual(resolveHostedMarket("France", "FR", countries), { country: "France", currency: "EUR" });
  deepStrictEqual(resolveHostedMarket("Poland", "POL", countries), { country: "Poland", currency: "EUR" });
  deepStrictEqual(resolveHostedMarket("United States", "US", countries), { country: "United States", currency: "USD" });
});

Deno.test("hosted checkout rejects unsupported, ambiguous and mismatched destinations", () => {
  throws(() => resolveHostedMarket("Norway", "NO", countries));
  throws(() => resolveHostedMarket("France", "US", countries));
  throws(() => resolveHostedMarket("France", "", [...countries, countries[0]]));
});

Deno.test("hosted checkout accepts only supported Stripe currencies", () => {
  for (const currency of ["gbp", "eur", "usd"]) equal(isHostedCurrency(currency), true);
  for (const currency of ["GBP", "inr", "", null]) equal(isHostedCurrency(currency), false);
});
