import { describe, expect, it } from "vitest";

import type { JobDecisionResponse } from "@/lib/api";
import type { JobRow } from "@/lib/types";
import {
  applyStatusBadgeClasses,
  applyStatusBadgeVariant,
  formatApiDecisionError,
  formatApplyStatusLabel,
  isAppliedStatus,
  isApplyingStatus,
  isRejectedStatus,
  jobMetaHighlights,
  normalizedApplyStatus,
  showAcceptForStatus,
  showRejectForStatus,
} from "./utils";

describe("homeUtils", () => {
  describe("normalizedApplyStatus", () => {
    it("trimsAndUppercases", () => {
      expect(normalizedApplyStatus("  apply  ")).toBe("APPLY");
    });

    it("handlesNullishAsEmpty", () => {
      expect(normalizedApplyStatus(null)).toBe("");
      expect(normalizedApplyStatus(undefined)).toBe("");
    });
  });

  describe("isAppliedStatus", () => {
    it("returnsTrueForApplied", () => {
      expect(isAppliedStatus("applied")).toBe(true);
      expect(isAppliedStatus("APPLIED")).toBe(true);
    });
  });

  describe("isApplyingStatus", () => {
    it("matchesApplying", () => {
      expect(isApplyingStatus("APPLYING")).toBe(true);
    });
  });

  describe("showAcceptForStatus", () => {
    it("onlyWhenApply", () => {
      expect(showAcceptForStatus("APPLY")).toBe(true);
      expect(showAcceptForStatus("apply")).toBe(true);
      expect(showAcceptForStatus("PENDING")).toBe(false);
    });
  });

  describe("showRejectForStatus", () => {
    it("falseWhenRejected", () => {
      expect(showRejectForStatus("REJECTED")).toBe(false);
    });

    it("trueWhenPending", () => {
      expect(showRejectForStatus("")).toBe(true);
    });
  });

  describe("isRejectedStatus", () => {
    it("detectsRejected", () => {
      expect(isRejectedStatus("rejected")).toBe(true);
    });
  });

  describe("formatApplyStatusLabel", () => {
    it("pendingWhenEmpty", () => {
      expect(formatApplyStatusLabel("")).toBe("Pending");
    });

    it("replacesUnderscores", () => {
      expect(formatApplyStatusLabel("DO_NOT_APPLY")).toBe("DO NOT APPLY");
    });
  });

  describe("applyStatusBadgeVariant", () => {
    it("mapsKnownStatuses", () => {
      expect(applyStatusBadgeVariant("APPLY")).toBe("default");
      expect(applyStatusBadgeVariant("APPLYING")).toBe("secondary");
      expect(applyStatusBadgeVariant("REJECTED")).toBe("destructive");
    });
  });

  describe("applyStatusBadgeClasses", () => {
    it("returnsTailwindSnippetForApply", () => {
      const cls = applyStatusBadgeClasses("APPLY");
      expect(cls).toContain("emerald");
    });
  });

  describe("jobMetaHighlights", () => {
    it("skipsEmDashSentinel", () => {
      const job = {
        seniority: "Sr",
        experience: "—",
        workModel: "Remote",
        employmentType: "",
      } as JobRow;
      expect(jobMetaHighlights(job)).toEqual(["Sr", "Remote"]);
    });
  });

  describe("formatApiDecisionError", () => {
    it("joinsErrorAndSteps", () => {
      const res: JobDecisionResponse = {
        ok: false,
        decision: "accept",
        error: "top",
        steps: [{ phase: "x", ok: false, message: "bad" }],
        applyStatusUpdated: null,
        dbApplyStatus: null,
        skippedReason: null,
      };
      expect(formatApiDecisionError(res)).toContain("top");
      expect(formatApiDecisionError(res)).toContain("x: bad");
    });

    it("fallbackWhenEmpty", () => {
      const res: JobDecisionResponse = {
        ok: false,
        decision: "reject",
        error: null,
        steps: [],
        applyStatusUpdated: null,
        dbApplyStatus: null,
        skippedReason: null,
      };
      expect(formatApiDecisionError(res)).toBe("Something went wrong.");
    });
  });
});
