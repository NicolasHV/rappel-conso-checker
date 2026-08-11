"""Client for the DGCCRF RappelConso open data API.

Dataset: rappelconso-v2-gtin-espaces (data.economie.gouv.fr), which lists
product recalls with a `gtin` field containing one or more barcodes
separated by spaces.
"""
from __future__ import annotations

import re
from typing import Any

import httpx

DATASET = "rappelconso-v2-gtin-espaces"
BASE_URL = f"https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/{DATASET}/records"
GTIN_FIELD = "gtin"
REQUEST_TIMEOUT = 10.0
RESULT_LIMIT = 20

# Best-effort mapping of the dataset's known column names to the keys we
# expose in our API. If the upstream schema changes, unmapped fields are
# still returned under "raw" so nothing is silently lost.
FIELD_MAP: dict[str, str] = {
    "reference": "reference_fiche",
    "category": "categorie_de_produit",
    "subcategory": "sous_categorie_de_produit",
    "brand": "nom_de_la_marque_du_produit",
    "model": "noms_des_modeles_ou_references",
    "identification": "identification_des_produits",
    "reason": "motif_du_rappel",
    "risks": "risques_encourus_par_le_consommateur",
    "conduct": "conduites_a_tenir_par_le_consommateur",
    "publication_date": "date_de_publication",
    "sale_zone": "zone_geographique_de_vente",
    "distributors": "distributeurs",
    "images": "liens_vers_les_images",
    "sheet_link": "lien_vers_la_fiche_rappel",
}

_IMAGE_SEPARATORS = re.compile(r"[|;,\s]+")


class RappelConsoError(Exception):
    """Raised when the upstream RappelConso API cannot be reached or parsed."""


def _gtin_tokens(record: dict[str, Any]) -> list[str]:
    value = record.get(GTIN_FIELD)
    if not value:
        return []
    return re.split(r"\s+", str(value).strip())


def _record_matches(record: dict[str, Any], barcode: str) -> bool:
    tokens = _gtin_tokens(record)
    if tokens:
        return barcode in tokens
    # Fallback if the gtin field is absent/renamed upstream: look for the
    # barcode as a standalone token anywhere in the record's text values.
    for value in record.values():
        if value is None:
            continue
        if barcode in re.split(r"\s+", str(value)):
            return True
    return False


def _extract_images(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = [p for p in _IMAGE_SEPARATORS.split(raw) if p.startswith("http")]
    return parts


def _format_record(record: dict[str, Any]) -> dict[str, Any]:
    formatted: dict[str, Any] = {
        key: record.get(source_field)
        for key, source_field in FIELD_MAP.items()
        if source_field != "liens_vers_les_images"
    }
    formatted["images"] = _extract_images(record.get(FIELD_MAP["images"]))
    formatted["gtin"] = _gtin_tokens(record)
    formatted["raw"] = record
    return formatted


async def search_by_barcode(barcode: str) -> list[dict[str, Any]]:
    """Return every RappelConso record whose gtin list contains `barcode`."""
    query = f'search({GTIN_FIELD}, "{barcode}")'
    params = {"where": query, "limit": RESULT_LIMIT}

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        try:
            response = await client.get(BASE_URL, params=params)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise RappelConsoError(
                f"Impossible de contacter l'API RappelConso : {exc}"
            ) from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise RappelConsoError("Réponse invalide de l'API RappelConso") from exc

    results = payload.get("results", [])
    matches = [r for r in results if _record_matches(r, barcode)]
    return [_format_record(r) for r in matches]
