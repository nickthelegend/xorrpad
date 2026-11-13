// MIT · Copyright (c) 2026 Nivesh Gajengi
// Actual firmware view selection, without hardware or network doubles.
#include <cmath>
#include <cassert>
#include "../xorrpad/padstate.h"
int main(){
 PadState p;p.ok=true;
 unsigned checks=0;auto view=[&](const char *name,uint32_t now=1000){assert(!strcmp(padMirrorView(p,now),name));++checks;};
 view("home");p.fund.visible=true;view("fund");p.fund.visible=false;
 p.portfolio.visible=true;view("portfolio");p.portfolio.visible=false;
 p.predict.positionsVisible=true;view("outcomes");p.predict.positionsVisible=false;
 p.predict.enabled=true;view("predict");p.predict.enabled=false;
 p.positionCount=0;view("positions",6000);view("home",12000);p.positionCount=-1;
 p.journal.visible=true;view("journal");p.journal.visible=false;
 p.ambient.visible=true;view("ambient");p.ambient.visible=false;
 p.scan.visible=true;view("scan");view("home",8000);
 p.pending=true;view("scan");p.scan.visible=false;view("decision");
 p.liqGuard.active=true;view("decision");p.pending=false;view("liq_guard");
 p.tiltBlocked=true;view("liq_guard");p.liqGuard.active=false;view("cooldown");
 p.fund.visible=true;view("fund");p.fund.visible=false;
 p.pending=true;p.tiltAllowed=true;view("decision");
 p.killed=true;view("killed");p.flatten.id="local-plan";view("flatten");
 p.rearmRequested=true;view("killed");
 printf("F9 native mirror view priorities: %u checks passed\n",checks);
}
