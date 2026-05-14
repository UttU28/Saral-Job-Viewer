"""Tests for restriction + experience pre-checks in utils.jobDecisionService."""

from utils.jobDecisionService import (
    experienceTagImpliesAboveFiveYears,
    findJobDescriptionExperienceTags,
    jobImpliesExperienceAboveFive,
    maxNumericFromExperienceTag,
    scanTextImpliesExperienceAboveFive,
)


def test_maxNumericFromExperienceTag_picksLargestRun():
    assert maxNumericFromExperienceTag("minimum 10 years of experience") == 10
    assert maxNumericFromExperienceTag("3-5 years of experience") == 5


def test_experienceTagImpliesAboveFiveYears_boundary():
    assert experienceTagImpliesAboveFiveYears("4 years of experience") is False
    assert experienceTagImpliesAboveFiveYears("5 years of experience") is True
    assert experienceTagImpliesAboveFiveYears("6+ years of experience") is True


def test_scanTextImpliesExperienceAboveFive():
    body = "We need minimum 5 years of experience with Python."
    assert scanTextImpliesExperienceAboveFive(body) is True
    six = "We need minimum 6 years of experience with Python."
    assert scanTextImpliesExperienceAboveFive(six) is True
    low = "Minimum 3 years of experience with Python."
    assert scanTextImpliesExperienceAboveFive(low) is False


def test_findJobDescriptionExperienceTags_nonEmpty():
    tags = findJobDescriptionExperienceTags("3+ years of experience required.")
    assert len(tags) >= 1


def test_jobImpliesExperienceAboveFive_usesTitleAndDescription():
    job = {
        "title": "Engineer",
        "visaOrMatchNote": "",
        "jobResponsibility": "",
        "jobDescription": "Must have 5+ years of experience leading teams.",
    }
    assert jobImpliesExperienceAboveFive(job) is True


def test_jobImpliesExperienceAboveFive_falseForLow():
    job = {
        "title": "Junior role",
        "jobDescription": "Minimum 2 years of experience with Linux.",
    }
    assert jobImpliesExperienceAboveFive(job) is False
