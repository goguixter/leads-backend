import { CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";
import { UnprocessableEntityError } from "./errors";

export function normalizeFromCountryAndNational(phoneCountry: string, phoneNational: string) {
  const iso2 = phoneCountry.toUpperCase();
  const parsed = parsePhoneNumberFromString(phoneNational, iso2 as CountryCode);

  if (!parsed || !parsed.isValid()) {
    throw new UnprocessableEntityError("Telefone invalido para o pais informado");
  }

  return {
    phoneRaw: phoneNational,
    phoneE164: parsed.number,
    phoneCountry: iso2,
    phoneValid: true
  };
}

export function normalizeFromInternational(phone: string) {
  const parsed = parsePhoneNumberFromString(phone);

  if (!parsed || !parsed.isValid() || !parsed.country) {
    throw new UnprocessableEntityError("Telefone internacional invalido");
  }

  return {
    phoneRaw: phone,
    phoneE164: parsed.number,
    phoneCountry: parsed.country,
    phoneValid: true
  };
}
