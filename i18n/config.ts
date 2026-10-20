/** UI languages. Add a locale here plus messages/{locale}.json. RTL locales flip layout via dir. */
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const rtlLocales: readonly string[] = ["ar", "he", "fa", "ur"];

export function dirFor(locale: string): "ltr" | "rtl" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}
