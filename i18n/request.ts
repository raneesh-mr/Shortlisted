import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

// English only for now. When more locales ship, resolve the locale here
// (from a locale route segment) and load the matching messages file.
export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages: (await import(`../messages/${defaultLocale}.json`)).default,
}));
