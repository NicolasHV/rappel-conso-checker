import httpx
import pytest
import respx

from app.rappelconso import BASE_URL, RappelConsoError, search_by_barcode

MATCHING_RECORD = {
    "reference_fiche": "2024-01-0123",
    "nom_de_la_marque_du_produit": "MarqueTest",
    "noms_des_modeles_ou_references": "Modèle X",
    "motif_du_rappel": "Présence de corps étrangers",
    "risques_encourus_par_le_consommateur": "Risque d'étouffement",
    "conduites_a_tenir_par_le_consommateur": "Ne plus consommer, rapporter en magasin",
    "date_de_publication": "2024-05-01",
    "zone_geographique_de_vente": "France entière",
    "distributeurs": "Supermarché Test",
    "liens_vers_les_images": "https://example.com/image1.jpg | https://example.com/image2.jpg",
    "lien_vers_la_fiche_rappel": "https://rappel.conso.gouv.fr/fiche-rappel/1234",
    "gtin": "3273720193318 3273720193319",
}

OTHER_RECORD = {
    "reference_fiche": "2024-02-0456",
    "gtin": "0000000000000",
}


@respx.mock
async def test_search_by_barcode_returns_matching_records():
    respx.get(BASE_URL).mock(
        return_value=httpx.Response(200, json={"results": [MATCHING_RECORD]})
    )

    results = await search_by_barcode("3273720193318")

    assert len(results) == 1
    record = results[0]
    assert record["brand"] == "MarqueTest"
    assert record["model"] == "Modèle X"
    assert record["reason"] == "Présence de corps étrangers"
    assert record["images"] == [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg",
    ]
    assert record["gtin"] == ["3273720193318", "3273720193319"]
    assert record["sheet_link"] == "https://rappel.conso.gouv.fr/fiche-rappel/1234"


@respx.mock
async def test_search_by_barcode_filters_out_non_matching_records():
    respx.get(BASE_URL).mock(
        return_value=httpx.Response(
            200, json={"results": [MATCHING_RECORD, OTHER_RECORD]}
        )
    )

    results = await search_by_barcode("3273720193318")

    assert len(results) == 1
    assert results[0]["reference"] == "2024-01-0123"


@respx.mock
async def test_search_by_barcode_no_match_returns_empty_list():
    respx.get(BASE_URL).mock(
        return_value=httpx.Response(200, json={"results": [OTHER_RECORD]})
    )

    results = await search_by_barcode("3273720193318")

    assert results == []


@respx.mock
async def test_search_by_barcode_raises_on_network_error():
    respx.get(BASE_URL).mock(side_effect=httpx.ConnectError("boom"))

    with pytest.raises(RappelConsoError):
        await search_by_barcode("3273720193318")


@respx.mock
async def test_search_by_barcode_raises_on_http_error_status():
    respx.get(BASE_URL).mock(return_value=httpx.Response(500))

    with pytest.raises(RappelConsoError):
        await search_by_barcode("3273720193318")
