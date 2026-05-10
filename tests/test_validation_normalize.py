"""validation.py classifier normalization — no DB."""
from __future__ import annotations

import validation as validation_module


def test_normalizeClassifierDecisionForDb_applyVariants():
    assert validation_module.normalizeClassifierDecisionForDb("apply") == "APPLY"
    assert validation_module.normalizeClassifierDecisionForDb(" APPLY ") == "APPLY"


def test_normalizeClassifierDecisionForDb_holdAndDoNotApply():
    assert validation_module.normalizeClassifierDecisionForDb("hold") == "DO_NOT_APPLY"
    assert validation_module.normalizeClassifierDecisionForDb("do_not_apply") == "DO_NOT_APPLY"


def test_normalizeClassifierDecisionForDb_unknownPassesThroughUpper():
    assert validation_module.normalizeClassifierDecisionForDb("custom_label") == "CUSTOM_LABEL"


def test_displayJobId_truncatesLongIds():
    fn = validation_module._displayJobId  # noqa: SLF001
    long_id = "x" * 50
    out = fn(long_id, maxLen=12)
    assert len(out) <= 12
    assert "…" in out

