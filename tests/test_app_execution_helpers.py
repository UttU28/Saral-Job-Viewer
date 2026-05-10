"""Serialization helpers for Cloud Run executions (mocked Execution protos)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import (
    _executionShortName,
    _executionStateFromExecution,
    _executionToPayload,
)


def test_executionShortName_trimsPath():
    assert _executionShortName("projects/p/locations/r/jobs/j/executions/ex-1") == "ex-1"
    assert _executionShortName("") == ""


@pytest.mark.parametrize(
    "failed,succeeded,cancelled,expected",
    [
        (1, 0, 0, "FAILED"),
        (0, 1, 0, "SUCCEEDED"),
        (0, 0, 1, "CANCELLED"),
        (0, 0, 0, "RUNNING"),
    ],
)
def test_executionStateFromExecution_rules(failed, succeeded, cancelled, expected):
    ex = SimpleNamespace(
        failed_count=failed,
        succeeded_count=succeeded,
        cancelled_count=cancelled,
    )
    assert _executionStateFromExecution(ex) == expected


def test_executionToPayload_shape():
    ex = SimpleNamespace(
        name="projects/x/jobs/j/executions/run-abc",
        job="projects/x/jobs/j",
        succeeded_count=1,
        failed_count=0,
        cancelled_count=0,
        running_count=0,
        start_time="2024-01-01T00:00:00Z",
        completion_time="2024-01-01T00:01:00Z",
    )
    payload = _executionToPayload(ex)
    assert payload["shortName"] == "run-abc"
    assert payload["state"] == "SUCCEEDED"
    assert payload["succeededCount"] == 1

