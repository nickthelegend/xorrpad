# T8: v1.0.0 release documents

Read `docs/v1/SPEC.md` first.

- **README:** rewrite it for v1. Cover:
  - what xorrpad is;
  - the architecture diagram;
  - the venue table;
  - the trade lifecycle;
  - the safety model;
  - setup: desk, pad (USB/BLE/Wi-Fi), phone app, Tailscale, Ollama and keys;
  - the hackathon section: the Solana Perps & Prediction Markets bounty, and why the pm-AMM.
- **`CHANGELOG.md`:** a v1.0.0 entry listing everything added, and that nothing was removed.
- **`TESTING.md`:** one total table from a real full run. List every skip with its reason, and every BLOCKED item with the exact action needed.
- **`HACKATHON_SUBMISSION_FORM.md`:** every field the Solana hackathon and the pm-AMM bounty ask for, filled from facts. Put TODOs where only Nick knows the answer.
- **Version bumps:** desk `package.json` `1.0.0`, keeper `1.0.0`, firmware `1.0.0`. Make sure all of them agree.

Make one commit. Do not tag; Claude tags after review.
