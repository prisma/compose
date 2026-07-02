import { describe, expect, test } from "bun:test";
import { hydrateDescriptor, hydratePostgres } from "../runtime/index.ts";
import { postgres } from "../postgres.ts";

// Bun.SQL instances are callable (tagged-template query functions), so
// `instanceof`/`.constructor` checks don't apply cleanly — assert the shape
// that matters: a callable client exposing the expected SQL methods.
function isSqlClient(value: unknown): boolean {
  return (
    typeof value === "function" &&
    typeof (value as { close?: unknown }).close === "function" &&
    typeof (value as { begin?: unknown }).begin === "function"
  );
}

describe("hydratePostgres", () => {
  test("builds a Bun.SQL client from DATABASE_URL", () => {
    const client = hydratePostgres(postgres(), {
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    });

    expect(isSqlClient(client)).toBe(true);
  });

  test("throws when DATABASE_URL is missing", () => {
    expect(() => hydratePostgres(postgres(), {})).toThrow(/DATABASE_URL/);
  });
});

describe("hydrateDescriptor", () => {
  test("dispatches a postgres() descriptor to hydratePostgres", () => {
    const client = hydrateDescriptor(postgres(), {
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    });

    expect(isSqlClient(client)).toBe(true);
  });
});
