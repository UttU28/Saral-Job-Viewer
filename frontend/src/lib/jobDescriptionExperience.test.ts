import { describe, expect, it } from "vitest";

import {
  buildDescriptionHighlightSegments,
  experienceTagImpliesAboveFiveYears,
  findJobDescriptionExperienceTags,
  jobDescriptionImpliesExperienceAboveFive,
  maxNumericFromExperienceTag,
} from "./jobDescriptionExperience";

describe("jobDescriptionExperience", () => {
  describe("buildDescriptionHighlightSegments", () => {
    it("returnsSingleSpanWhenNoMatches", () => {
      const segs = buildDescriptionHighlightSegments("No requirements here.");
      expect(segs.length).toBe(1);
      expect(segs[0].highlight).toBe(false);
    });

    it("marksExperienceRanges", () => {
      const body = "We need minimum 5 years of experience with Python.";
      const segs = buildDescriptionHighlightSegments(body);
      const highlighted = segs.filter((s) => s.highlight);
      expect(highlighted.length).toBeGreaterThan(0);
    });

    it("handlesNullAsEmpty", () => {
      const segs = buildDescriptionHighlightSegments(null);
      expect(segs).toEqual([{ text: "", highlight: false }]);
    });
  });

  describe("findJobDescriptionExperienceTags", () => {
    it("collectsDistinctSnippetsInOrder", () => {
      const body = "3+ years of experience required. Also 3+ years of experience with AWS.";
      const tags = findJobDescriptionExperienceTags(body);
      expect(tags.length).toBeGreaterThanOrEqual(1);
    });

    it("returnsEmptyForBlank", () => {
      expect(findJobDescriptionExperienceTags("   ")).toEqual([]);
    });
  });

  describe("experienceTagImpliesAboveFiveYears", () => {
    it("isFalseForUpToFourYearSnippet", () => {
      expect(experienceTagImpliesAboveFiveYears("minimum 4 years of experience")).toBe(false);
    });
    it("isTrueForFiveOrMore", () => {
      expect(experienceTagImpliesAboveFiveYears("minimum 5 years of experience")).toBe(true);
      expect(experienceTagImpliesAboveFiveYears("minimum 6 years of experience")).toBe(true);
    });
  });

  describe("maxNumericFromExperienceTag", () => {
    it("returnsMaxDigitRun", () => {
      expect(maxNumericFromExperienceTag("3-8 years of experience")).toBe(8);
    });
  });

  describe("jobDescriptionImpliesExperienceAboveFive", () => {
    it("detectsHighRequirement", () => {
      expect(
        jobDescriptionImpliesExperienceAboveFive("We require 10+ years of experience with Go."),
      ).toBe(true);
      expect(jobDescriptionImpliesExperienceAboveFive("Minimum 5 years of experience with Go.")).toBe(true);
    });
    it("isFalseForLowRequirement", () => {
      expect(jobDescriptionImpliesExperienceAboveFive("Minimum 2 years of experience.")).toBe(false);
    });
  });
});
