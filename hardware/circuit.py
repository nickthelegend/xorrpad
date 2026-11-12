#!/usr/bin/env python3
"""SKiDL electrical draft. Generates KiCad netlists and a priced-BOM input manifest.

NOT AN ORDER RELEASE. See README.md for open electrical/mechanical review gates.
Run with SKiDL 3.0.0 and KiCad 9/10 symbol libraries (KICAD_SYMBOL_DIR).
No network, credentials or hardware access.
"""
import argparse
import json
import os
from pathlib import Path

LIB = Path(os.environ.get("KICAD_SYMBOL_DIR", "/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols"))
for version in ("", "6", "7", "8", "9", "10"):
    os.environ[f"KICAD{version}_SYMBOL_DIR"] = str(LIB)
ROOT = Path(__file__).resolve().parent
(ROOT / "generated").mkdir(exist_ok=True)
os.chdir(ROOT / "generated")
from skidl import Circuit, Part, Pin, Net, KICAD9, SKIDL

parser = argparse.ArgumentParser()
parser.add_argument("--sku", choices=["pro", "core"], required=True)
args = parser.parse_args()
out = ROOT / "generated"
out.mkdir(exist_ok=True)
os.chdir(out)
circuit = Circuit()
circuit.__enter__()
manifest = []


def part(lib, name, ref, mpn, lcsc="", footprint=None, note=""):
    p = Part(str(LIB / f"{lib}.kicad_sym"), name, ref=ref, tool=KICAD9)
    p.tag = ref
    p.value = mpn
    if footprint:
        p.footprint = footprint
    p.fields["LCSC"] = lcsc
    manifest.append({"ref": ref, "mpn": mpn, "lcsc": lcsc,
                     "footprint": p.footprint or "", "note": note})
    return p


def custom(name, ref, pins, footprint, lcsc="", note=""):
    # Numbered passive terminal models are explicit where no library symbol exists.
    p = Part(name=name, ref=ref, tool=SKIDL, pins=[Pin(num=str(n), name=s, func=Pin.types.PASSIVE) for n, s in pins])
    p.tag = ref
    p.value, p.footprint = name, footprint
    p.fields["LCSC"] = lcsc
    manifest.append({"ref": ref, "mpn": name, "lcsc": lcsc, "footprint": footprint, "note": note})
    return p


nets = {}
def net(name):
    if name not in nets:
        nets[name] = Net(name)
    return nets[name]


def wire(p, pins):
    for pin, name in pins.items():
        net(name).connect(p[str(pin)])


def two(lib, symbol, ref, mpn, lcsc, a, b, fp):
    p = part(lib, symbol, ref, mpn, lcsc, fp)
    wire(p, {1: a, 2: b})
    return p


def resistor(ref, mpn, lcsc, a, b):
    return two("Device", "R", ref, mpn, lcsc, a, b, "Resistor_SMD:R_0603_1608Metric")


def cap(ref, a, b, bulk=False):
    return two("Device", "C", ref,
               "GRM21BR61A226ME44L" if bulk else "CC0603KRX7R9BB104",
               "C441864" if bulk else "C14663", a, b,
               "Capacitor_SMD:C_0805_2012Metric" if bulk else "Capacitor_SMD:C_0603_1608Metric")


mcu = part("RF_Module", "ESP32-S3-WROOM-1", "U1", "ESP32-S3-WROOM-1-N16R8", "C2913202")
wire(mcu, {1:"GND", 2:"3V3", 3:"EN", 40:"GND", 41:"GND", 13:"USB_DN", 14:"USB_DP", 27:"BOOT"})
gpio = {int(p.name[2:]): p for p in mcu.pins if p.name.startswith("IO") and p.name[2:].isdigit()}
def io(pin, name):
    net(name).connect(gpio[pin])

# Retain existing matrix/mic/audio/TFT GPIOs; encoder assignments are a new PCB proposal.
for p, n in zip([10,11,12,13,18,17,8,14], ["ROW0","ROW1","ROW2","ROW3","COL0","COL1","COL2","COL3"]):
    io(p, n)
for p, n in [(48,"RGB_3V3"),(21,"ENC_A"),(47,"ENC_B"),(38,"ENC_SW")]:
    io(p, n)
resistor("R1", "0603WAF1002T5E", "C25804", "3V3", "EN")
cap("C1", "EN", "GND")
resistor("R2", "0603WAF1002T5E", "C25804", "3V3", "BOOT")
for ref, n in [("SW15", "BOOT"), ("SW16", "EN")]:
    two("Switch", "SW_Push", ref, "TS-1088-AR02016", "", n, "GND", "Button_Switch_SMD:SW_SPST_TL3342")
cap("C2", "3V3", "GND")
cap("C3", "3V3", "GND", True)

usb = part("Connector", "USB_C_Receptacle_USB2.0_16P", "J1", "TYPE-C-31-M-12", "C165948",
           "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12")
for p in usb.pins:
    if p.name in ["GND", "SHIELD"]: net("GND").connect(p)
    elif p.name == "VBUS": net("VBUS").connect(p)
    elif p.name == "D+": net("USB_DP").connect(p)
    elif p.name == "D-": net("USB_DN").connect(p)
    elif p.name in ["CC1", "CC2"]: net(p.name).connect(p)
for ref, n in [("R3","CC1"),("R4","CC2")]:
    resistor(ref,"0603WAF5101T5E","C23186",n,"GND")
esd = part("Power_Protection","USBLC6-2SC6","U2","USBLC6-2SC6","C7519")
wire(esd,{1:"USB_DP",6:"USB_DP",3:"USB_DN",4:"USB_DN",2:"GND",5:"VBUS"})
# Power switch limit remains deliberately unresolved. Do not populate/energize this draft.
limit = custom("TPS2553DBVR", "U8", [(1,"IN"),(2,"GND"),(3,"EN"),(4,"FAULT_N"),(5,"ILIM"),(6,"OUT")],
               "Package_TO_SOT_SMD:SOT-23-6", note="USB advertised-current detection and ILIM tolerance design REQUIRED")
wire(limit,{1:"VBUS",2:"GND",3:"VBUS",4:"USB_FAULT",5:"ILIM",6:"5V_LIMITED"})
resistor("R5","ILIM_VALUE_TBD","","ILIM","GND")
reg = part("Regulator_Switching","TPS62160DSG","U3","TPS62160DSGR","C324077")
wire(reg,{1:"GND",2:"5V_LIMITED",3:"5V_LIMITED",4:"GND",5:"FB",6:"3V3",7:"BUCK_SW",9:"GND"})
two("Device","L","L1","SWPA4026S2R2MT","","BUCK_SW","3V3","Inductor_SMD:L_Sunlord_SWPA4026S")
resistor("R6","0603WAF6203T5E","","3V3","FB")
resistor("R7","0603WAF2003T5E","","FB","GND")
for ref,a in [("C4","5V_LIMITED"),("C5","3V3")]:cap(ref,a,"GND",True)

encoder = part("Device","RotaryEncoder_Switch","ENC1","EC11E15244G1","C370970",
               "Rotary_Encoder:RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm",
               note="Assembler THT soldering; shaft/peg drawing must be matched to case")
wire(encoder,{"A":"ENC_A","B":"ENC_B","C":"GND","S1":"ENC_SW","S2":"GND"})
for ref,n in zip(["R8","R9","R10"],["ENC_A","ENC_B","ENC_SW"]):
    resistor(ref,"0603WAF1002T5E","C25804","3V3",n)

# 4x4 logical matrix: 14 populated cells, two reserved. One diode per socket.
cells = [(0,2),(0,1),(0,0),(1,2),(1,1),(1,0),(2,3),(2,2),(3,2),(2,1),(2,0),(3,3),(3,1),(3,0)]
for i,(r,c) in enumerate(cells,1):
    sw = part("Switch","SW_Push",f"SW{i}","CPG151101S11","C2803348","Xorrpad:Kailh_CPG151101S11")
    wire(sw,{1:f"COL{c}",2:f"KEY{i}"})
    # KiCad Device:D pad1=K, pad2=A. Columns pull up; selected row sinks.
    two("Device","D",f"D{i}","1N4148W","C81598",f"ROW{r}",f"KEY{i}","Diode_SMD:D_SOD-123")

level = part("74xGxx","74AHCT1G125","U4","SN74AHCT1G125DBVR","C7484","Package_TO_SOT_SMD:SOT-23-5")
wire(level,{1:"GND",2:"RGB_3V3",3:"GND",4:"RGB_5V",5:"5V_LIMITED"})
resistor("R11","0603WAF0330T5E","","RGB_5V","RGB_IN")
cap("C6","5V_LIMITED","GND")
led_count = 15 if args.sku == "core" else 1
for i in range(led_count):
    led = part("LED","WS2812B-2020",f"LED{i+1}","WS2812B-2020-V6","C52917434")
    # Library names, rather than numbers, preserve the 2020 pinout (different from 5050).
    for name,n in [("VDD","5V_LIMITED"),("VSS","GND"),("DIN","RGB_IN" if i==0 else f"RGB_LINK{i}"),("DOUT",f"RGB_LINK{i+1}")]:
        net(n).connect(led[name])
    cap(f"C{20+i}","5V_LIMITED","GND")

if args.sku == "pro":
    for p,n in [(5,"MIC_SCK"),(4,"MIC_WS"),(6,"MIC_SD"),(15,"SPK_BCLK"),(16,"SPK_LRC"),(7,"SPK_DIN"),
                (39,"TFT_SCK"),(40,"TFT_MOSI"),(41,"TFT_DC"),(42,"TFT_RST"),(1,"TFT_CS"),(2,"TFT_BLK")]:io(p,n)
    mic=part("Sensor_Audio","ICS-43434","U5","ICS-43434","C5656610",note="NRND/EOL conflict: sourcing hold; acoustic opening and replacement qualification required")
    wire(mic,{1:"MIC_WS",2:"GND",3:"GND",4:"MIC_SCK",5:"3V3",6:"MIC_SD"})
    cap("C7","3V3","GND")
    amp=part("Audio","MAX98357A","U6","MAX98357AETE+T","C910544")
    wire(amp,{1:"SPK_DIN",3:"GND",4:"3V3",7:"5V_LIMITED",8:"5V_LIMITED",9:"SPK_P",10:"SPK_N",11:"GND",14:"SPK_LRC",15:"GND",16:"SPK_BCLK",17:"GND"})
    cap("C8","5V_LIMITED","GND")
    cap("C9","5V_LIMITED","GND",True)
    spk=part("Connector_Generic","Conn_01x02","J2","B2B-PH-K-S(LF)(SN)","","Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical",note="Vendor crimps matching speaker cable; BTL outputs must not connect to ground")
    wire(spk,{1:"SPK_P",2:"SPK_N"})
    tft=custom("ER-CON50HT-1","J3",[(i,str(i)) for i in range(1,51)],"Xorrpad:ER-CON50HT-1_DRAFT",note="Top-contact FPC; footprint must be checked against actual connector drawing")
    # EastRising Rev2.1 pp8-10. Interface II, 4 wire SPI: IM3..0 = 1110.
    wire(tft,{1:"BL_K",6:"GND",7:"3V3",8:"3V3",9:"3V3",10:"TFT_RST",34:"TFT_MOSI",35:"3V3",36:"TFT_DC",37:"TFT_SCK",38:"TFT_CS",40:"3V3",41:"3V3",42:"3V3",43:"GND",48:"GND",49:"GND",50:"GND"})
    for pin in range(11,33):net("GND").connect(tft[str(pin)])
    for i,pin in enumerate(range(2,6),12):
        resistor(f"R{i}","0603WAF1000T5E","","5V_LIMITED",f"BL_A{pin}")
        net(f"BL_A{pin}").connect(tft[str(pin)])
    mos=part("Transistor_FET","2N7002","Q1","2N7002","","Package_TO_SOT_SMD:SOT-23")
    wire(mos,{1:"TFT_BLK",2:"GND",3:"BL_K"})
    resistor("R16","0603WAF1003T5E","","TFT_BLK","GND")
    cap("C10","3V3","GND")
    cap("C11","3V3","GND",True)

# Preserve real ERC findings: no invented PWR_FLAG to hide incomplete power review.
circuit.ERC()
circuit.generate_netlist(file_=str(out/f"{args.sku}.net"),tool=KICAD9)
for item in manifest:
    p = next(p for p in circuit.parts if p.ref == item["ref"])
    item["pins"] = {pin.num: pin.nets[0].name for pin in p.pins if pin.nets}
(out/f"{args.sku}-parts.json").write_text(json.dumps(manifest,indent=2)+"\n")
print(f"{args.sku}: {len(manifest)} board components, {len(nets)} named nets; REVIEW REQUIRED")
