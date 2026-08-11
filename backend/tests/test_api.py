import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.rappelconso import RappelConsoError
from app.routers import recalls

client = TestClient(app)


@pytest.mark.parametrize("barcode", ["abc", "123", "12345678901234567", ""])
def test_check_invalid_barcode_returns_400(barcode):
    response = client.get(f"/api/check/{barcode}")
    assert response.status_code in (400, 404)  # 404 for the empty-path case


def test_check_found(monkeypatch):
    async def fake_search(barcode):
        return [{"reference": "2024-01-0123", "brand": "MarqueTest"}]

    monkeypatch.setattr(recalls, "search_by_barcode", fake_search)

    response = client.get("/api/check/3273720193318")

    assert response.status_code == 200
    data = response.json()
    assert data["found"] is True
    assert data["count"] == 1
    assert data["recalls"][0]["brand"] == "MarqueTest"


def test_check_not_found(monkeypatch):
    async def fake_search(barcode):
        return []

    monkeypatch.setattr(recalls, "search_by_barcode", fake_search)

    response = client.get("/api/check/3273720193318")

    assert response.status_code == 200
    data = response.json()
    assert data["found"] is False
    assert data["count"] == 0
    assert data["recalls"] == []


def test_check_upstream_error(monkeypatch):
    async def fake_search(barcode):
        raise RappelConsoError("API RappelConso indisponible")

    monkeypatch.setattr(recalls, "search_by_barcode", fake_search)

    response = client.get("/api/check/3273720193318")

    assert response.status_code == 502
