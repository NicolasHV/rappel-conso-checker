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
  const manualForm = document.getElementById("manual-form");
  const barcodeInput = document.getElementById("barcode-input");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  let scanner = null;
  let scanning = false;

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

  async function startScanning() {
    if (typeof Html5Qrcode === "undefined") {
      setStatus("Le module de scan n'a pas pu être chargé (vérifiez votre connexion).", "error");
      return;
    }

    readerEl.classList.remove("hidden");
    scanBtn.classList.add("hidden");
    stopScanBtn.classList.remove("hidden");

    scanner = new Html5Qrcode("reader", {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF,
      ],
      // Utilise l'API native BarcodeDetector quand le navigateur la
      // supporte (bien plus rapide que le décodeur JS de repli).
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });

    try {
      await scanner.start(
        {
          facingMode: "environment",
          // Ignoré silencieusement si le device ne le supporte pas.
          advanced: [{ focusMode: "continuous" }],
        },
        {
          fps: 20,
          qrbox: { width: 260, height: 140 },
          // Évite les flux caméra en résolution inutilement élevée qui
          // ralentissent chaque frame à décoder.
          videoConstraints: { width: { ideal: 1280 }, height: { ideal: 720 } },
        },
        (decodedText) => {
          barcodeInput.value = decodedText;
          stopScanning();
          checkBarcode(decodedText);
        },
        () => {
          /* per-frame decode failures are expected while aiming the camera */
        }
      );
      scanning = true;
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

  async function stopScanning() {
    if (scanner && scanning) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch (err) {
        /* scanner may already be stopped */
      }
    }
    scanning = false;
    resetScanUI();
  }

  scanBtn.addEventListener("click", startScanning);
  stopScanBtn.addEventListener("click", stopScanning);
})();
