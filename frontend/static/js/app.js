(() => {
  "use strict";

  // Site 100% statique : pas de backend, appel direct à l'API RappelConso
  // (dataset "rappelconso-v2-gtin-trie", une ligne par GTIN rappelé) depuis
  // le navigateur.
  const DATASET = "rappelconso-v2-gtin-trie";
  const BASE_URL = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
  const RESULT_LIMIT = 20;

  const FIELD_MAP = {
    reference: "numero_fiche",
    category: "categorie_produit",
    subcategory: "sous_categorie_produit",
    brand: "marque_produit",
    model: "modeles_ou_references",
    identification: "identification_produits",
    reason: "motif_rappel",
    risks: "risques_encourus",
    conduct: "conduites_a_tenir_par_le_consommateur",
    publication_date: "date_publication",
    sale_zone: "zone_geographique_de_vente",
    distributors: "distributeurs",
    images: "liens_vers_les_images",
    sheet_link: "lien_vers_la_fiche_rappel",
  };

  const MIN_BARCODE_LEN = 6;
  const MAX_BARCODE_LEN = 14;

  function extractImages(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/[|;,\s]+/)
      .filter((part) => part.startsWith("http"));
  }

  function formatRecord(record) {
    const formatted = {};
    for (const [key, sourceField] of Object.entries(FIELD_MAP)) {
      if (sourceField === FIELD_MAP.images) continue;
      formatted[key] = record[sourceField] ?? null;
    }
    formatted.images = extractImages(record[FIELD_MAP.images]);
    formatted.gtin = record.gtin ?? null;
    return formatted;
  }

  class RappelConsoError extends Error {}

  async function searchByBarcode(barcode) {
    // "gtin" est un champ numérique : le filtre d'égalité ODSQL renvoie
    // déjà exactement les lignes correspondantes, sans post-filtrage.
    const url = `${BASE_URL}?${new URLSearchParams({ where: `gtin=${barcode}`, limit: RESULT_LIMIT })}`;

    let response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new RappelConsoError(`Impossible de contacter l'API RappelConso : ${err.message}`);
    }
    if (!response.ok) {
      throw new RappelConsoError(`Impossible de contacter l'API RappelConso : HTTP ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      throw new RappelConsoError("Réponse invalide de l'API RappelConso");
    }

    return (payload.results || []).map(formatRecord);
  }

  async function checkBarcodeRemote(barcode) {
    if (!/^\d+$/.test(barcode) || barcode.length < MIN_BARCODE_LEN || barcode.length > MAX_BARCODE_LEN) {
      const err = new Error(
        "Code-barres invalide : attendu une suite de 6 à 14 chiffres (EAN-8, UPC-A, EAN-13, GTIN-14...)."
      );
      err.isValidation = true;
      throw err;
    }
    const recalls = await searchByBarcode(barcode);
    return {
      barcode,
      found: recalls.length > 0,
      count: recalls.length,
      recalls,
    };
  }

  const scanBtn = document.getElementById("scan-btn");
  const stopScanBtn = document.getElementById("stop-scan-btn");
  const readerEl = document.getElementById("reader");
  const videoEl = document.getElementById("scanner-video");
  const manualForm = document.getElementById("manual-form");
  const barcodeInput = document.getElementById("barcode-input");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  // Scan caméra : lecture directe du flux vidéo (getUserMedia) + décodage
  // via zxing-wasm (ZXing-C++ compilé en WebAssembly, nettement plus
  // rapide que les décodeurs 1D purement JS). On gère nous-mêmes la
  // caméra plutôt que de déléguer à une lib tout-en-un, pour garder un
  // contrôle direct et fiable sur le choix de la caméra arrière.
  const SCAN_FORMATS = ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF"];
  const READER_OPTIONS = { formats: SCAN_FORMATS, tryHarder: false, maxNumberOfSymbols: 1 };
  // Zone décodée = centre du flux vidéo, alignée sur le viseur affiché
  // (.scanner-viewfinder) : moins de pixels à traiter par image, donc
  // décodage plus rapide.
  const CROP_WIDTH_RATIO = 0.8;
  const CROP_HEIGHT_RATIO = 0.45;

  const scanCanvas = document.createElement("canvas");
  const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });

  let mediaStream = null;
  let scanning = false;
  let scanRafHandle = null;

  if (typeof ZXingWASM !== "undefined") {
    // Précharge le module WASM en tâche de fond pour éviter le délai de
    // premier chargement au moment où l'utilisateur lance le scan.
    ZXingWASM.prepareZXingModule({ fireImmediately: true }).catch(() => {
      /* le premier scan se chargera du module si le préchargement échoue */
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      // Chemin relatif : le site peut être servi depuis un sous-chemin
      // (ex. GitHub Pages, https://<user>.github.io/<repo>/).
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        /* offline shell is a nice-to-have, not critical */
      });
    });
  }

  function setStatus(message, type) {
    if (!message) {
      statusEl.classList.add("hidden");
      statusEl.textContent = "";
      return;
    }
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }

  function clearResults() {
    resultsEl.replaceChildren();
  }

  function field(container, label, value) {
    if (!value) return;
    const wrap = document.createElement("div");
    wrap.className = "field";
    const strong = document.createElement("strong");
    strong.textContent = label;
    const text = document.createElement("span");
    text.textContent = value;
    wrap.appendChild(strong);
    wrap.appendChild(text);
    container.appendChild(wrap);
  }

  function renderRecallCard(recall) {
    const card = document.createElement("article");
    card.className = "recall-card";

    if (recall.images && recall.images.length > 0) {
      const img = document.createElement("img");
      img.src = recall.images[0];
      img.alt = recall.model || recall.brand || "Produit rappelé";
      img.loading = "lazy";
      card.appendChild(img);
    }

    const title = document.createElement("h3");
    title.textContent = [recall.brand, recall.model].filter(Boolean).join(" — ") || "Produit rappelé";
    card.appendChild(title);

    field(card, "Motif du rappel", recall.reason);
    field(card, "Risques", recall.risks);
    field(card, "Conduite à tenir", recall.conduct);
    field(card, "Distributeurs", recall.distributors);
    field(card, "Date de publication", recall.publication_date);
    field(card, "Zone de vente", recall.sale_zone);

    if (recall.sheet_link) {
      const link = document.createElement("a");
      link.className = "sheet-link";
      link.href = recall.sheet_link;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Voir la fiche officielle RappelConso →";
      card.appendChild(link);
    }

    return card;
  }

  function renderResults(data) {
    clearResults();

    const banner = document.createElement("div");
    if (data.found) {
      banner.className = "result-banner danger";
      banner.textContent = `⚠️ Attention : ${data.count} rappel(s) trouvé(s) pour ce code-barres (${data.barcode})`;
    } else {
      banner.className = "result-banner success";
      banner.textContent = `✅ Aucun rappel trouvé pour le code-barres ${data.barcode}`;
    }
    resultsEl.appendChild(banner);

    data.recalls.forEach((recall) => {
      resultsEl.appendChild(renderRecallCard(recall));
    });
  }

  async function checkBarcode(barcode) {
    clearResults();
    setStatus("Recherche en cours…", "info");
    try {
      const data = await checkBarcodeRemote(barcode);
      setStatus(null);
      renderResults(data);
    } catch (err) {
      setStatus(`Erreur : ${err.message}`, "error");
    }
  }

  manualForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const barcode = barcodeInput.value.trim();
    if (!barcode) return;
    stopScanning();
    checkBarcode(barcode);
  });

  async function scanLoop() {
    if (!scanning) return;

    if (videoEl.readyState < videoEl.HAVE_CURRENT_DATA) {
      scanRafHandle = requestAnimationFrame(scanLoop);
      return;
    }

    const videoWidth = videoEl.videoWidth;
    const videoHeight = videoEl.videoHeight;
    const cropWidth = Math.round(videoWidth * CROP_WIDTH_RATIO);
    const cropHeight = Math.round(videoHeight * CROP_HEIGHT_RATIO);
    const cropX = Math.round((videoWidth - cropWidth) / 2);
    const cropY = Math.round((videoHeight - cropHeight) / 2);

    scanCanvas.width = cropWidth;
    scanCanvas.height = cropHeight;
    scanCtx.drawImage(videoEl, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    try {
      const imageData = scanCtx.getImageData(0, 0, cropWidth, cropHeight);
      const results = await ZXingWASM.readBarcodes(imageData, READER_OPTIONS);
      if (results.length > 0) {
        const decodedText = results[0].text;
        stopScanning();
        barcodeInput.value = decodedText;
        checkBarcode(decodedText);
        return;
      }
    } catch (err) {
      /* per-frame decode failures are expected while aiming the camera */
    }

    if (scanning) {
      scanRafHandle = requestAnimationFrame(scanLoop);
    }
  }

  async function startScanning() {
    if (typeof ZXingWASM === "undefined") {
      setStatus("Le module de scan n'a pas pu être chargé (vérifiez votre connexion).", "error");
      return;
    }

    // Efface un message d'erreur laissé par une tentative précédente
    // (ex. permission caméra refusée puis accordée au retry).
    setStatus(null);

    readerEl.classList.remove("hidden");
    scanBtn.classList.add("hidden");
    stopScanBtn.classList.remove("hidden");

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const [videoTrack] = mediaStream.getVideoTracks();
      // Best-effort : ignoré si le device/navigateur ne le supporte pas.
      videoTrack.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});

      videoEl.srcObject = mediaStream;
      await videoEl.play();

      scanning = true;
      scanRafHandle = requestAnimationFrame(scanLoop);
    } catch (err) {
      setStatus(
        "Impossible d'accéder à la caméra. Vérifiez les autorisations ou saisissez le code manuellement.",
        "error"
      );
      resetScanUI();
    }
  }

  function resetScanUI() {
    readerEl.classList.add("hidden");
    scanBtn.classList.remove("hidden");
    stopScanBtn.classList.add("hidden");
  }

  function stopScanning() {
    scanning = false;
    if (scanRafHandle !== null) {
      cancelAnimationFrame(scanRafHandle);
      scanRafHandle = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    videoEl.srcObject = null;
    resetScanUI();
  }

  scanBtn.addEventListener("click", startScanning);
  stopScanBtn.addEventListener("click", stopScanning);
})();
