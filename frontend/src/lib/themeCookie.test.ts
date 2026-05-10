import { beforeEach, describe, expect, it } from "vitest";

import { readThemeFromCookie, writeThemeToCookie } from "./themeCookie";

describe("themeCookie", () => {
  beforeEach(() => {
    // happy-dom keeps cookie jar across tests — expire the app cookie explicitly.
    document.cookie = "saralJobViewer_theme=; path=/; max-age=0";
  });

  it("readThemeFromCookie_returnsNullWhenMissing", () => {
    expect(readThemeFromCookie()).toBeNull();
  });

  it("writeThenRead_roundTripsDark", () => {
    writeThemeToCookie("dark");
    expect(readThemeFromCookie()).toBe("dark");
  });

  it("writeThenRead_roundTripsLight", () => {
    writeThemeToCookie("light");
    expect(readThemeFromCookie()).toBe("light");
  });

  it("readThemeFromCookie_ignoresInvalidValue", () => {
    document.cookie = "saralJobViewer_theme=purple";
    expect(readThemeFromCookie()).toBeNull();
  });
});
