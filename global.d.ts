import type messages from "./messages/en.json";

// Typed translation keys: a missing or misspelt key is a compile error.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
  }
}
