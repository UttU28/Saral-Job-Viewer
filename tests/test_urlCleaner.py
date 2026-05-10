"""Tests for utils/urlCleaner.py — pure URL and company normalization."""
from __future__ import annotations

import pytest

from utils.urlCleaner import (
    cleanUrl,
    dropTrackingParams,
    extractZipRecruiterTarget,
    isValidUrl,
    normalizeCompanyName,
    normalizeHttpUrl,
    stripApplySuffix,
    unwrapRedirectUrl,
)


def test_normalizeHttpUrl_lowercasesSchemeAndHost():
    out = normalizeHttpUrl("HTTPS://Example.COM/path")
    assert out.startswith("https://example.com/")


def test_dropTrackingParams_removesUtm():
    raw = "https://jobs.example.com/view?job=1&utm_source=linkedin&id=2"
    out = dropTrackingParams(raw)
    assert "utm_source" not in out
    assert "job=1" in out or "id=2" in out


def test_unwrapRedirectUrl_followsNestedUrlParam():
    nested = "https://target.example.com/role?id=9"
    wrapped = f"https://click.tracker/redirect?url={__import__('urllib.parse').parse.quote(nested, safe='')}"
    assert unwrapRedirectUrl(wrapped).startswith("https://target.example.com/")


def test_stripApplySuffix_removesTrailingApply():
    out = stripApplySuffix("https://acme.com/careers/role/apply")
    assert not out.rstrip("/").endswith("apply")


def test_cleanUrl_emptyReturnsEmpty():
    assert cleanUrl("") == ""
    assert cleanUrl("   ") == ""
    assert cleanUrl(None) == ""


def test_cleanUrl_rejectsNonHttp():
    assert cleanUrl("ftp://x.com/a") == ""
    assert cleanUrl("not a url") == ""


def test_isValidUrl_positive():
    assert isValidUrl("https://example.com/job/123") is True


def test_normalizeCompanyName_collapsesWhitespaceAndTitleCase():
    # Punctuation outside the allowlist is stripped before title-casing.
    assert normalizeCompanyName("  foo_bar  inc.  ") == "Foo Bar Inc"


@pytest.mark.parametrize(
    "raw,expected_substring",
    [
        ("https://www.ziprecruiter.com/job-redirect?match_token=e", "ziprecruiter"),
    ],
)
def test_extractZipRecruiterTarget_nonRedirectUnchanged(raw, expected_substring):
    # Invalid token → unchanged path still contains domain
    assert expected_substring in extractZipRecruiterTarget(raw).lower()


def test_cleanUrl_dropsTrackingAfterRedirects():
    url = "https://hire.example.com/p/abc?utm_medium=social"
    cleaned = cleanUrl(url)
    assert "utm_medium" not in cleaned

