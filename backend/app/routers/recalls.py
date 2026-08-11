from fastapi import APIRouter, HTTPException

from ..rappelconso import RappelConsoError, search_by_barcode

router = APIRouter(tags=["recalls"])

_MIN_BARCODE_LEN = 6
_MAX_BARCODE_LEN = 14


@router.get("/check/{barcode}")
async def check_barcode(barcode: str) -> dict:
    barcode = barcode.strip()
    if not barcode.isdigit() or not (_MIN_BARCODE_LEN <= len(barcode) <= _MAX_BARCODE_LEN):
        raise HTTPException(
            status_code=400,
            detail="Code-barres invalide : attendu une suite de 6 à 14 chiffres (EAN-8, UPC-A, EAN-13, GTIN-14...).",
        )

    try:
        recalls = await search_by_barcode(barcode)
    except RappelConsoError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "barcode": barcode,
        "found": len(recalls) > 0,
        "count": len(recalls),
        "recalls": recalls,
    }
