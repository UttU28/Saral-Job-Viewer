import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("mergesTailwindConflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handlesConditionalClasses", () => {
    expect(cn("base", false && "hidden", true && "block")).toBe("base block");
  });
});
