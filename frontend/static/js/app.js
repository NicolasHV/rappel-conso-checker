(() => {
  "use strict";

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
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
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
      const response = await fetch(`/api/check/${encodeURIComponent(barcode)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Erreur inconnue");
      }
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
      verbose: false,
    });

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 140 } },
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
