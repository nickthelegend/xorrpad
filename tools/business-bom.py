#!/usr/bin/env python3
"""Reconcile requested CSVs to SKiDL manifests using saved public price evidence.
No external requests. Blank prices remain unknown; never treat them as zero.
"""
import csv
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/business"
evidence = json.loads((OUT/"price-sources.json").read_text())["parts"]
RUNS = [100, 500, 1000, 5000]
DATE = "2026-11-12"


def build(sku):
    manifest = json.loads((ROOT/f"hardware/generated/{sku}-parts.json").read_text())
    groups = defaultdict(list)
    for p in manifest:
        groups[(p["mpn"], p["lcsc"], p["footprint"], p["note"])].append(p["ref"])
    rows = []
    def add(mpn, code, refs, qty, fp="", note="", custom=None):
        for run in RUNS:
            required = qty * run
            source = evidence.get(code)
            unit = tier = stock = ""
            status = "quote needed from JLCPCB/LCSC"
            url = f"https://www.lcsc.com/product-detail/{code}.html" if code else "https://jlcpcb.com/pcb-assembly"
            if source:
                assert source["mpn"] == mpn, (code, mpn, source["mpn"])
                eligible = [t for t in source["tiers"] if t["min_qty"] <= required]
                if eligible:
                    t = max(eligible, key=lambda t: t["min_qty"])
                    unit, tier = str(t["usd"]), t["min_qty"]
                    stock = source["stock"]
                    status = "published reference; packaging/assembler quote needed"
                    if stock < required:
                        status = "stock insufficient; quote needed from LCSC/JLCPCB"
                url = source["url"]
            if custom:
                url, unit, tier, status = custom(run, required)
            extended = str(Decimal(unit)*qty) if unit != "" else ""
            rows.append([sku,run,mpn,code,','.join(refs),qty,required,tier,unit,extended,stock,status,url,DATE,fp,note])
    for (mpn,code,fp,note),refs in sorted(groups.items()):
        custom = None
        if mpn == "ER-CON50HT-1":
            custom = lambda n,q:("https://www.buydisplay.com/50-pin-0-5mm-pitch-top-contact-zif-connector-fpc-connector", "0.20" if q>=1000 else "0.29",1000 if q>=1000 else 1,"published reference; consigned assembly quote needed")
        add(mpn,code,refs,len(refs),fp,note,custom)
    add("Gateron G Pro 3.0 linear mechanical switch, 35-pack", "", ["FINAL_SWITCHES"],14,
        note="ASSUMPTION: listed 35-pack retained at every volume; no wholesale discount. Confirm selected color/pin variant and stock; assembler does not solder switches.",
        custom=lambda n,q:("https://www.gateron.com/products/gateron-g-pro-30-switch-set?VariantsId=10621",str(Decimal('9.80')/35),35,"retail reference; quote needed from Gateron for bulk"))
    for name,qty,url in [
        ("14-cap custom legend set",1,"https://maxkeyboard.com/shop/cherry-mx-keycaps/custom-color-printed-keycaps/"),
        ("Vendor printed tray/plate/knob set" + (" + display pod" if sku=="pro" else ""),1,"https://jlc3dp.com"),
        ("Screws, feet, inserts, gasket and final assembly consumable kit",1,"https://craftcloud3d.com"),
        ("USB-C data cable",1,"https://www.lcsc.com")]:
        add(name,"",["FINAL_KIT"],qty,custom=lambda n,q,u=url:(u,"","","quote needed from named vendor; design/package not frozen"))
    if sku=="pro":
        add("ER-TFT028-4 no-touch bare FPC panel", "", ["FINAL_DISPLAY"],1,
            note="Displayed base configuration includes option ambiguity. $6.35 at 100 is a reference, not a confirmed no-touch panel quote. 500+ explicitly quote request.",
            custom=lambda n,q:("https://www.buydisplay.com/serial-spi-2-8-tft-lcd-module-display-320x240-optional-touch-screen","6.35" if n==100 else "",100 if n==100 else "","quote needed from EastRising for exact bare panel/configuration"))
        add("GSPK3520037RBOX-8R1W-L100","C46961948",["FINAL_SPEAKER"],1,note="Stock snapshot lacks 500 units. Quote needed for JST termination and acoustic fit; price excludes that harness labor.")
        add("PHR-2/S PH-002T-P0.5S vendor-terminated speaker harness", "", ["FINAL_HARNESS"],1,
            custom=lambda n,q:("https://www.jst-mfg.com/product/pdf/eng/ePH.pdf","","","quote needed from harness assembler"))
    path=OUT/f"bom-{sku}.csv"
    with path.open('w',newline='') as f:
        w=csv.writer(f,lineterminator="\n")
        w.writerow(["sku","finished_units","mpn_or_spec","lcsc","designators","qty_per_unit","required_parts","published_tier_min_parts","reference_usd_per_part","reference_usd_per_finished_unit","stock_snapshot_parts","status","source_url","read_date","footprint","notes"])
        w.writerows(rows)
    for run in RUNS:
        selected=[r for r in rows if r[1]==run]
        total=sum((Decimal(r[9]) for r in selected if r[9]!=""),Decimal(0))
        missing=sum(r[9]=="" for r in selected)
        print(f"{sku} {run}: priced-line subtotal ${total:.4f}; {missing} unpriced lines; NOT total BOM")


if __name__ == "__main__":
    for sku in ["pro","core"]:build(sku)
