"""Pure mapping helpers in utils/midhtechSuggestApi.py."""
from __future__ import annotations

from utils.midhtechSuggestApi import (
    inferCloudSpecialization,
    inferAtsPlatform,
    mapExperienceLevel,
    mapJobType,
    mapSenioritySelect,
)


def test_inferCloudSpecialization_keywords():
    assert inferCloudSpecialization("We use AWS and EKS") == "aws"
    assert inferCloudSpecialization("Azure AKS shop") == "azure"
    assert inferCloudSpecialization("GCP kubernetes") == "gcp"
    assert inferCloudSpecialization("rust only") == ""


def test_mapSenioritySelect_buckets():
    assert mapSenioritySelect("Senior Engineer") == "senior"
    assert mapSenioritySelect("Lead Developer") == "lead"
    assert mapSenioritySelect("Junior role") == "junior"


def test_mapExperienceLevel_numericRanges():
    assert mapExperienceLevel("3+ years") == "2-4"
    assert mapExperienceLevel("entry level") == "0-2"


def test_mapJobType_knownLabels():
    assert mapJobType("full-time") == "Full-time"
    assert mapJobType("unknown") == ""


def test_inferAtsPlatform_fromUrl():
    assert inferAtsPlatform({"originalJobPostUrl": "https://jobs.lever.co/acme/123"}) == "Lever"
    assert inferAtsPlatform({"jobUrl": "https://boards.greenhouse.io/foo"}) == "Greenhouse"
    assert inferAtsPlatform({"originalJobPostUrl": ""}) == ""
