import "fake-indexeddb/auto";
import { vi } from "vitest";

// "server-only" throws outside a React Server environment; tests run plain Node.
vi.mock("server-only", () => ({}));
