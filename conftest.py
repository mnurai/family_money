"""Test fixtures for the Family Budget Tracker.

The tests talk to the system only through the small `FBT` interface below
(see tests/reference_fbt.py for its meaning).  By default they run against
ReferenceFBT, an in-memory model of the business rules (BR-01..BR-28), which
proves that the expected numbers in doc 06 are consistent.

When the real service layer exists (Aziza), write an adapter class with the
same methods and select it with:  FBT_ADAPTER=mypackage.adapter:RealFBT pytest
Nothing else in the tests has to change.
"""
import importlib
import os

import pytest

from reference_fbt import ReferenceFBT


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "tc(*ids): traceability IDs from doc 11, e.g. tc('TC-11.1', 'TC-30.1')")


def pytest_collection_modifyitems(items):
    """Write the tc(...) marker IDs into the JUnit XML so that
    scripts/update_traceability.py can update doc 08."""
    adapter = os.environ.get("FBT_ADAPTER", "reference")
    for item in items:
        item.user_properties.append(("adapter", adapter))
        for mark in item.iter_markers("tc"):
            for tc_id in mark.args:
                item.user_properties.append(("tc", tc_id))


@pytest.fixture
def fbt():
    spec = os.environ.get("FBT_ADAPTER")
    if spec:
        module, cls = spec.split(":")
        return getattr(importlib.import_module(module), cls)()
    return ReferenceFBT()


@pytest.fixture
def example(fbt):
    """Family at the start of the worked example (doc 06)."""
    fbt.create_account("Kaspi card", "BANK_CARD", "200000")
    fbt.create_account("Cash", "CASH", "10000")
    fbt.create_account("Savings", "SAVINGS", "0")
    fbt.set_budget("Food", "2026-11", "60000")
    return fbt
