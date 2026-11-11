import "@fontsource-variable/manrope";
import "./style.css";

export async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    signal: AbortSignal.timeout(35000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Service unavailable. Please try again later.");
  }
  if (!response.ok)
    throw new Error(
      data.error || "Service unavailable. Please try again later.",
    );
  return data;
}

const waitlistForm = document.querySelector("#waitlist-form");
const waitlistMessage = document.querySelector("#waitlist-message");
const waitlistButton = waitlistForm.querySelector("button");
const count = document.querySelector("#waitlist-count");
function showCount(value) {
  if (Number.isSafeInteger(value) && value >= 0)
    count.textContent = `${value.toLocaleString()} ${value === 1 ? "signup" : "signups"} on the waitlist · live from our signup service`;
}
waitlistButton.disabled = false;
waitlistMessage.textContent = "";
request("/api/waitlist")
  .then((data) => showCount(data.count))
  .catch((error) => {
    count.textContent = "Waitlist count unavailable.";
    waitlistMessage.textContent = error.message;
  });
waitlistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  waitlistButton.disabled = true;
  waitlistButton.textContent = "Joining…";
  waitlistMessage.textContent = "Saving your signup…";
  try {
    const data = await request("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(waitlistForm))),
    });
    showCount(data.count);
    waitlistMessage.textContent = data.message;
    waitlistForm.reset();
  } catch (error) {
    waitlistMessage.textContent = error.message;
  } finally {
    waitlistButton.disabled = false;
    waitlistButton.textContent = "Join the waitlist ↗";
  }
});

const preorderButton = document.querySelector("#preorder-button");
const preorderMessage = document.querySelector("#preorder-message");
const terms = document.querySelector("#preorder-terms");
const consent = document.querySelector("#terms-consent");
const accepted = document.querySelector("#accept-terms");
const payment = document.querySelector("#payment");
const check = document.querySelector("#payment-check");
let config;
let reservation;
async function showPayment(order) {
  payment.hidden = false;
  const link = document.querySelector("#payment-link");
  link.hidden = false;
  link.href = order.url;
  document.querySelector("#payment-details").textContent =
    `${order.price} USDC on ${order.network} to ${order.merchant}`;
  const savedTerms = document.createElement("a");
  savedTerms.href = order.termsUrl;
  savedTerms.textContent =
    "Reservation and refund terms accepted for this reservation";
  savedTerms.target = "_blank";
  savedTerms.rel = "noopener noreferrer";
  terms.replaceChildren(savedTerms);
  const qr = document.querySelector("#payment-qr");
  try {
    const QRCode = (await import("qrcode")).default;
    await QRCode.toCanvas(qr, order.url, {
      width: 220,
      margin: 2,
      color: { dark: "#242d29", light: "#f2eee5" },
    });
    qr.hidden = false;
  } catch {
    qr.hidden = true;
  } // The wallet link remains usable if QR rendering fails.
}
try {
  config = await request("/api/preorder");
  const link = document.createElement("a");
  link.href = config.termsUrl;
  link.textContent = "Read the reservation and refund terms";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  terms.replaceChildren(link);
  consent.hidden = false;
  document.querySelector("#preorder-intro").textContent =
    "USDC reservations are open via Solana Pay. Review the price, network, merchant and published terms before creating a payment request. A reservation is separate from the free waitlist.";
  document
    .querySelector("#faq-terms")
    .replaceChildren(
      "Reservations are governed by the published reservation and refund terms. Read them before paying. No shipping date is promised. ",
      link.cloneNode(true),
    );
  preorderButton.textContent = `Reserve for ${config.price} USDC`;
  preorderMessage.textContent = `Solana ${config.network}. Review the terms before continuing.`;
} catch (error) {
  preorderMessage.textContent = error.message;
}
accepted.addEventListener("change", () => {
  preorderButton.disabled =
    !config || !accepted.checked || Boolean(reservation);
});
preorderButton.addEventListener("click", async () => {
  if (!config || !accepted.checked || reservation) return;
  preorderButton.disabled = true;
  preorderMessage.textContent = "Creating your reservation…";
  try {
    reservation = await request("/api/preorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termsAccepted: accepted.checked,
        version: config.version,
      }),
    });
    await showPayment(reservation);
    accepted.disabled = true;
    const recoveryUrl = new URL(window.location.href);
    recoveryUrl.searchParams.set("reference", reservation.reference);
    recoveryUrl.hash = "preorder";
    document.querySelector("#payment-reference").textContent =
      `Reference: ${reservation.reference}. Status link: ${recoveryUrl}`;
    window.history.replaceState(null, "", recoveryUrl);
    preorderMessage.textContent =
      "Reservation created. Payment is pending. Open your wallet to review and sign.";
  } catch (error) {
    preorderMessage.textContent = error.message;
    preorderButton.disabled = !accepted.checked;
  }
});
async function checkPayment(reference) {
  check.disabled = true;
  preorderMessage.textContent = "Checking finalized on-chain payment…";
  try {
    const result = await request(
      `/api/preorder-status?reference=${encodeURIComponent(reference)}`,
    );
    if (result.status === "confirmed") {
      document.querySelector("#payment-link").hidden = true;
      document.querySelector("#payment-qr").hidden = true;
      preorderMessage.textContent =
        "Payment confirmed on chain. Keep your reference and transaction receipt. This is a reservation; no shipping date is promised.";
      const receipt = document.createElement("a");
      receipt.href = `https://explorer.solana.com/tx/${encodeURIComponent(result.signature)}${result.network === "devnet" ? "?cluster=devnet" : ""}`;
      receipt.textContent = "View payment receipt";
      receipt.target = "_blank";
      receipt.rel = "noopener noreferrer";
      document
        .querySelector("#payment-reference")
        .replaceChildren(`Reference: ${reference}. `, receipt);
    } else {
      if (result.url) await showPayment(result);
      preorderMessage.textContent =
        "Payment pending. A finalized transfer has not been found yet. Check again after your wallet confirms it; do not pay twice.";
    }
  } catch (error) {
    preorderMessage.textContent = error.message;
  } finally {
    check.disabled = false;
  }
}
check.addEventListener("click", () => {
  if (reservation) checkPayment(reservation.reference);
});
const recoveryReference = new URL(window.location.href).searchParams.get(
  "reference",
);
if (
  recoveryReference &&
  /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recoveryReference)
) {
  reservation = { reference: recoveryReference };
  preorderButton.disabled = true;
  payment.hidden = false;
  document.querySelector("#payment-link").hidden = true;
  document.querySelector("#payment-reference").textContent =
    `Reference: ${recoveryReference}`;
  await checkPayment(recoveryReference);
}
