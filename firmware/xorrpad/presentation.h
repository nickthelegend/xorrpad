#pragma once
#include <ArduinoJson.h>
#include <cmath>
#include "padstate.h"
#include "logic/predict.h"
#include "logic/ambient.h"
#include "logic/perps.h"
#include "logic/flatten.h"
#include "logic/presentation.h"
#include "logic/portfolio.h"
#include "logic/fund.h"

inline bool presentationConfirmationVisible(const PadState &pad) {
  return xorr::confirmationVisible(pad.ok,pad.pending,pad.factory,pad.killed && !(pad.clearSigning && pad.flatten.review(std::string(pad.signalId.c_str()))),
    pad.updating,pad.errorCode.length(),pad.pairCode.length(),pad.tiltBlocked,pad.tiltAllowed);
}
inline bool presentationWalletVisible(const PadState &pad) {
  return (pad.fund.visible || pad.portfolio.visible || pad.predict.positionsVisible) && pad.ok && !pad.pending &&
    !pad.factory && !pad.killed && !pad.updating && !pad.errorCode.length() &&
    !pad.liqGuard.fresh(millis()) && !pad.alertsOnly && !pad.pairCode.length() && !pad.abilityReview && !pad.listening &&
    !(pad.receiptSignature.length() && (int32_t)(pad.receiptUntil-millis())>0);
}

inline bool presentationLiqVisible(const PadState &p) {
  return p.liqGuard.fresh(millis()) && p.ok && !p.pending && !p.killed && !p.factory && !p.updating &&
    !p.errorCode.length() && !p.pairCode.length() && !p.alertsOnly && !p.abilityReview && !p.listening;
}
inline bool presentationPredictVisible(const PadState &p) {
  return !p.tiltBlocked && !presentationLiqVisible(p) && p.predict.enabled && p.ok && !p.pending && !p.killed && !p.factory && !p.updating &&
    !p.errorCode.length() && !p.pairCode.length() && !p.alertsOnly && !p.abilityReview &&
    !p.listening && !p.fund.visible && !p.portfolio.visible && !p.predict.positionsVisible &&
    !p.reply.length() && !p.abilityWidget.length() &&
    !(p.receiptSignature.length() && (int32_t)(p.receiptUntil-millis())>0) &&
    (int32_t)(p.keymapUntil-millis())<=0;
}

inline bool presentationHome(const PadState &p) {
 return !p.journal.visible && !p.pending && !p.killed && !p.factory && !p.updating && !p.tiltBlocked && !p.liqGuard.fresh(millis()) &&
  !p.errorCode.length() && !p.pairCode.length() && !p.alertsOnly && !p.abilityReview && !p.listening &&
  !p.fund.visible && !p.portfolio.visible && !p.predict.positionsVisible && !p.predict.enabled && !p.positionsVisible &&
  !p.reply.length() && !p.abilityWidget.length() && (int32_t)(p.receiptUntil-millis())<=0 && (int32_t)(p.keymapUntil-millis())<=0;
}

// Thin wire-to-screen adapter. Only desk-supplied values become market data.
inline void presentationMessage(JsonVariantConst d, PadState &pad, ChartState &chart) {
  String type = d["type"] | "";
  if(type=="ambient") {
    if(!xorr::parseAmbient(d,pad.ambient,millis()))pad.ambient=xorr::Ambient();
  } else if(type=="flatten") {
    if(!xorr::parseFlatten(d,pad.flatten,millis()))pad.flatten=xorr::Flatten();
  } else if(type=="perps") {
    if(!xorr::parsePerps(d,pad.perps,millis())){pad.perps=xorr::Perps();pad.perps.message="Setup required: refresh perp positions";}
  } else if(type=="liq_guard") {
    if(!xorr::parseLiqGuard(d,pad.liqGuard,millis()))pad.liqGuard=xorr::LiqGuard();
  } else if(type=="predict") {
    if(!xorr::parsePredict(d,pad.predict,millis())) {pad.predict.markets.clear();pad.predict.message="Setup required: refresh prediction feed";}
  } else if(type=="outcome_positions") {
    if(xorr::parseOutcomePositions(d,pad.predict)) {
      pad.fund.visible=pad.portfolio.visible=false;pad.reply="";pad.labelUntil=pad.receiptUntil=0;
    }
  } else if (type == "fund") {
    pad.predict.positionsVisible=false;
    if(xorr::parseFund(d,pad.fund)) {
      pad.portfolio.visible=false;pad.reply="";pad.labelUntil=0;pad.receiptUntil=0;
    } else pad.fund.visible=false;
  } else if (type == "portfolio") {
    pad.predict.positionsVisible=false;
    pad.fund.visible=false;
    pad.reply="";pad.labelUntil=0;pad.receiptUntil=0;
    if(!xorr::parsePortfolio(d,pad.portfolio))pad.portfolio.visible=false;
  } else if (type == "error") {
    pad.errorCode = d["code"] | "LINK_ERROR";
    pad.errorFix = d["fix"] | "Reconnect the desk";
  } else if (type == "reply") {
    pad.fund.visible=false;
    pad.portfolio.visible=false;
    pad.reply = d["text"].as<String>().substring(0, 2000);
    pad.replyAt = millis();
  } else if (type == "receipt") {
    pad.fund.visible=false;
    pad.portfolio.visible=false;
    pad.reply = ""; pad.errorCode = "";
  } else if (type == "signal") {
    pad.fund.visible=false;
    pad.portfolio.visible=false;
    pad.reply = "";
    pad.signalReduceOnly=d["reduceOnly"]==true;
    auto trusted = d["trusted"];
    pad.fingerprint = d["fingerprint"] | "";
    pad.signalSide = trusted["side"].is<const char*>() ? trusted["side"].as<String>() : d["side"] | "";
    pad.signalSize = trusted["size"] | String(d["sizeUsd"].as<float>(), 2);
    pad.signalPrice = trusted["price"] | "";
    pad.signalFee = trusted["fee"] | "";
  } else if (type == "pulse" && !pad.pending) {
    if (d["market"].is<const char*>()) pad.market = d["market"].as<String>();
    pad.price = d["price"] | 0.f;
    pad.hasPnl = d["unrealised"].is<float>() && std::isfinite(d["unrealised"].as<float>());
    pad.unrealised = pad.hasPnl ? d["unrealised"].as<float>() : 0;
    pad.positionCount = d["positions"] | -1;
    pad.positionN = 0;
    for (auto row : d["positionDetails"].as<JsonArrayConst>()) {
      if (pad.positionN == 8) break;
      if (!row["market"].is<const char*>() || !row["qty"].is<float>() ||
          !std::isfinite(row["qty"].as<float>()) || row["qty"].as<float>() <= 0) continue;
      auto &position = pad.positions[pad.positionN++];
      position.market = row["market"].as<String>().substring(0, 16);
      position.qty = row["qty"].as<float>();
      position.hasPnl = row["pnl"].is<float>() && std::isfinite(row["pnl"].as<float>());
      position.pnl = position.hasPnl ? row["pnl"].as<float>() : 0;
    }
    pad.chainOk = d["chainOk"] | false;
    pad.spentToday = d["spentToday"] | -1; pad.dayLimit = d["dayLimit"] | -1;
    pad.hoursState = d["hoursState"] | ""; pad.hoursNote = d["hoursNote"] | "";
    pad.nyTime = d["nyTime"] | ""; pad.marketOpen = d["marketOpen"] | false;
    chart.symbol = pad.market; chart.price = pad.price;
    chart.hasChange = d["change24h"].is<float>() && std::isfinite(d["change24h"].as<float>());
    chart.change24h = chart.hasChange ? d["change24h"].as<float>() : 0;
    chart.n = 0;
    for (auto value : d["closes"].as<JsonArrayConst>()) {
      if (chart.n == 48) break;
      float price = value.as<float>();
      if (!value.is<float>() || !std::isfinite(price) || price <= 0) continue;
      chart.closes[chart.n++] = price;
      if (chart.n == 1) chart.lo = chart.hi = price;
      else { chart.lo = std::min(chart.lo, price); chart.hi = std::max(chart.hi, price); }
    }
    chart.ok = std::isfinite(chart.price) && chart.price > 0;
  }
}
