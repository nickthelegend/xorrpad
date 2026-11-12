#!/usr/bin/env python3
"""Offline artifact/reconciliation checks. A pass is NOT electrical sign-off."""
import csv
import hashlib
import json
import re
import unittest
from decimal import Decimal
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
GEN=ROOT/'hardware/generated'
BUS=ROOT/'docs/business'
def parts(sku):return json.loads((GEN/f'{sku}-parts.json').read_text())
def read_csv(path):
    with path.open(newline='') as f:return list(csv.DictReader(f))
def rows(sku):return read_csv(BUS/f'bom-{sku}.csv')


class ManufacturingArtifacts(unittest.TestCase):
    def test_fourteen_distinct_hot_swap_matrix_cells(self):
        expected={(0,2),(0,1),(0,0),(1,2),(1,1),(1,0),(2,3),(2,2),(3,2),(2,1),(2,0),(3,3),(3,1),(3,0)}
        for sku in ['pro','core']:
            p={x['ref']:x for x in parts(sku)}
            sockets=[x for x in p.values() if x['lcsc']=='C2803348']
            self.assertEqual(len(sockets),14)
            found=set()
            for i in range(1,15):
                sw,diode=p[f'SW{i}'],p[f'D{i}']
                self.assertEqual(sw['footprint'],'Xorrpad:Kailh_CPG151101S11')
                self.assertEqual(sw['pins']['2'],diode['pins']['2'])
                found.add((int(diode['pins']['1'][-1]),int(sw['pins']['1'][-1])))
            self.assertEqual(found,expected)

    def test_usb_cc_and_btl_audio_safety_connections(self):
        for sku in ['pro','core']:
            p={x['ref']:x for x in parts(sku)}
            for ref,n in [('R3','CC1'),('R4','CC2')]:
                self.assertEqual(p[ref]['lcsc'],'C23186')
                self.assertEqual(set(p[ref]['pins'].values()),{n,'GND'})
            self.assertEqual(p['U1']['pins']['13'],'USB_DN')
            self.assertEqual(p['U1']['pins']['14'],'USB_DP')
            # Octal PSRAM module's GPIO35/36/37 pads are intentionally unused.
            for pin in ['28','29','30']:self.assertNotIn(pin,p['U1']['pins'])
            if sku=='pro':self.assertEqual(set(p['J2']['pins'].values()),{'SPK_P','SPK_N'})

    def test_sku_population_and_fpc(self):
        pro,core=parts('pro'),parts('core')
        self.assertEqual(sum(x['ref'].startswith('LED') for x in pro),1)
        self.assertEqual(sum(x['ref'].startswith('LED') for x in core),15)
        self.assertFalse(any(x['ref'] in ['U5','U6','J2','J3'] for x in core))
        fpc=next(p for p in pro if p['ref']=='J3')
        self.assertEqual([fpc['pins'][str(i)] for i in [6,7,8,9]],['GND','3V3','3V3','3V3'])
        self.assertEqual(fpc['pins']['37'],'TFT_SCK')
        self.assertIn('DRAFT',fpc['footprint'])

    def test_jlc_bom_cpl_references_reconcile(self):
        for sku in ['pro','core']:
            expected={p['ref'] for p in parts(sku)}
            bom=read_csv(GEN/f'{sku}-jlc-bom.csv')
            actual=[r for p in bom for r in p['Designator'].split(',')]
            self.assertEqual(set(actual),expected)
            self.assertEqual(len(actual),len(expected))
            cpl=read_csv(GEN/f'{sku}-cpl.csv')
            self.assertEqual({r['Designator'] for r in cpl},expected)
            for row in cpl:
                for key in ['Mid X','Mid Y']:self.assertTrue(Decimal(row[key].removesuffix('mm')).is_finite())
                if re.fullmatch(r'SW(?:[1-9]|1[0-4])',row['Designator']):self.assertEqual(row['Layer'],'B')

    def test_netlist_is_populated_and_matches_manifest(self):
        for sku in ['pro','core']:
            s=(GEN/f'{sku}.net').read_text()
            refs=re.findall(r'\(comp\s+\(ref "([^"]+)"\)',s)
            self.assertEqual(set(refs),{p['ref'] for p in parts(sku)})
            self.assertIn('(tool "SKiDL (3.0.0)")',s)
            self.assertGreater(len(re.findall(r'\(net\s+\(code ',s)),30)

    def test_quantity_tiers_provenance_and_missing_values(self):
        sources=json.loads((BUS/'price-sources.json').read_text())['parts']
        for sku in ['pro','core']:
            data=rows(sku)
            self.assertEqual({int(r['finished_units']) for r in data},{100,500,1000,5000})
            for r in data:
                q=int(r['qty_per_unit']);n=int(r['finished_units']);self.assertEqual(int(r['required_parts']),q*n)
                self.assertEqual(r['read_date'],'2026-11-12');self.assertTrue(r['source_url'].startswith('https://'))
                v=r['reference_usd_per_part']
                if v:
                    self.assertEqual(Decimal(r['reference_usd_per_finished_unit']),Decimal(v)*q)
                    if r['lcsc']:
                        d=sources[r['lcsc']];self.assertEqual(d['mpn'],r['mpn_or_spec'])
                        tier=max((x for x in d['tiers'] if x['min_qty']<=q*n),key=lambda x:x['min_qty'])
                        self.assertEqual(Decimal(v),Decimal(str(tier['usd'])))
                        if d['stock']<q*n:self.assertIn('stock insufficient',r['status'])
                else:
                    self.assertEqual(r['reference_usd_per_finished_unit'],'')
                    self.assertIn('quote needed',r['status'])
            # Missing bulk display cost must stay unknown, rather than reuse a lower tier.
            if sku=='pro':
                for r in data:
                    if r['designators']=='FINAL_DISPLAY' and int(r['finished_units'])>=500:self.assertEqual(r['reference_usd_per_part'],'')

    def test_local_autorouting_attempt_is_honest_and_current(self):
        # The original native failure is historical; keep its exact inputs
        # instead of comparing it to the later placement/routed DSNs.
        for r in json.loads((GEN/'routing-result.json').read_text()):
            sku=r['sku'];baseline=GEN/'native-baseline'
            self.assertEqual(hashlib.sha256((baseline/f'{sku}.dsn').read_bytes()).hexdigest(),r['dsn_sha256'])
            self.assertIn('-da',r['command']);self.assertIn('--api_server.enabled=false',r['command'])
            log=(GEN/f'{sku}-router.log').read_text()
            self.assertIn('Loading board file',log)
            self.assertEqual(r['session_created'],(baseline/f'{sku}.ses').exists())
            if r['session_created']:self.assertEqual(r['exit_code'],0)
            else:
                self.assertTrue(r['stop_reason']);self.assertNotEqual(r['exit_code'],0)

        for sku,evidence in [('pro','jar-routing-result.json'),('core','core-jar-routing-result.json')]:
            r=json.loads((GEN/evidence).read_text())[0]
            self.assertEqual(r['sku'],sku)
            self.assertEqual(hashlib.sha256((GEN/f'{sku}.dsn').read_bytes()).hexdigest(),r['dsn_sha256'])
            self.assertEqual(r['exit_code'],0);self.assertTrue(r['session_created'])
            self.assertTrue((GEN/f'{sku}.ses').is_file())
            self.assertIn('-da',r['command']);self.assertIn('--api_server.enabled=false',r['command'])
            self.assertIn('(deny network*)',' '.join(r['command']))

    def test_baseline_and_routed_drc_evidence_are_distinct(self):
        for sku in ['pro','core']:
            d=json.loads((GEN/f'{sku}-drc.json').read_text())
            self.assertGreater(len(d['unconnected_items']),0)
            self.assertGreater(len(d['violations']),0)
            self.assertTrue((GEN/f'{sku}-placement.kicad_pcb').is_file())
        for sku,phase in [('pro','p1'),('core','p2')]:
            d=json.loads((GEN/f'{sku}-{phase}-drc.json').read_text())
            self.assertFalse(d['unconnected_items'])
            self.assertFalse(d['violations'])
            summary=json.loads((GEN/f'{sku}-{phase}-summary.json').read_text())
            self.assertEqual(summary['board_sha256'],hashlib.sha256((GEN/f'{sku}.kicad_pcb').read_bytes()).hexdigest())
            self.assertEqual(summary['drc_sha256'],hashlib.sha256((GEN/f'{sku}-{phase}-drc.json').read_bytes()).hexdigest())
            self.assertEqual(summary['final'],dict(errors=0,warnings=0,unconnected=0))
            self.assertFalse(summary['key_centre_discrepancies'])
            self.assertEqual(summary['copper_layers'],4)
            settings=json.loads((GEN/f'{sku}.kicad_pro').read_text())['board']['design_settings']
            baseline=json.loads((GEN/f'{sku}-placement.kicad_pro').read_text())['board']['design_settings']
            self.assertEqual(settings['rule_severities'],baseline['rule_severities'])
            self.assertEqual(settings['drc_exclusions'],baseline['drc_exclusions'])



if __name__=='__main__':unittest.main(verbosity=2)
