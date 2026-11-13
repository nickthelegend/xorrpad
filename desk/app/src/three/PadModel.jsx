import {unlockEarcons,mirrorEarcon} from "./earcons.js";
import React, {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  Component,
} from "react";
import { useDesk } from "../core";
const Scene = lazy(() => import("./PadScene"));
class ModelBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.error ? (
      <>
        {this.props.poster}
        <span className="model-setup">
          Setup required: WebGL is unavailable. Key controls remain available.
        </span>
      </>
    ) : (
      this.props.children
    );
  }
}
export function PadModel({
  keys = [],
  device,
  pending,
  angle,
  pressed,
  onKey,
  onKnob,
}) {
  const d = useDesk(),
    [reduced, setReduced] = useState(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    root = useRef(),
    hits = useRef({});
  const [mobile, setMobile] = useState(
      () => matchMedia("(max-width:700px)").matches,
    ),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [layout, setLayout] = useState(null),
    [live, setLive] = useState({}),
    [mirror, setMirror] = useState(null);
  useEffect(() => {
    const event=d.event;
    if(event?.type==='pad_screen' && event.device===device?.device)setMirror({device:event.device,...event.screen});
    if(event?.type==='pad_link'){
      const current=event.devices?.find(p=>p.device===device?.device);
      if(current)setMirror(current);
    }
  }, [d.event,device?.device]);
  const mirrorDevice=mirror?.device===device?.device?{...device,...mirror}:device;
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)"),
      change = () => setReduced(q.matches);
    q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const q = matchMedia("(max-width:700px)"),
      f = () => {
        setMobile(q.matches);
        setReady(false);
      };
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/desktop/models/xorrpad-layout.json")
      .then((r) => {
        if (!r.ok) throw Error("CAD layout unavailable");
        return r.json();
      })
      .then((j) => {
        if (active) setLayout(j);
      })
      .catch((e) => {
        if (active) setLive({ error: e.message });
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!device) return;
    const c = new AbortController();
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      const r = await Promise.allSettled([
        d.api("/pad", undefined, { signal: c.signal }),
        d.api("/pad/chart", undefined, { signal: c.signal }),
      ]);
      if (!c.signal.aborted)
        setLive({
          status: r[0].status === "fulfilled" ? r[0].value : {},
          chart: r[1].status === "fulfilled" ? r[1].value : null,
        });
      busy = false;
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      c.abort();
      clearInterval(t);
    };
  }, [device?.device, d.api]);
  useEffect(() => {
    const unlock=()=>unlockEarcons();
    const play=e=>{if(e.detail.device===device?.device)mirrorEarcon(e.detail);};
    window.addEventListener("pointerdown",unlock);
    window.addEventListener("keydown",unlock);
    window.addEventListener("pad-earcon",play);
    return ()=>{window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);window.removeEventListener("pad-earcon",play);};
  },[device?.device]);
  const poster = (
    <img
      className="model-poster"
      src="/desktop/media/pad/hero-34.png"
      alt="Static studio render of the real xorrpad CAD"
      title="Static CAD preview; live connection and signal state are in the device island"
      fetchPriority="high"
    />
  );
  useEffect(() => {
    if (!layout || (!mobile && ready)) return;
    let dead = false;
    const box = root.current;
    const update = () => {
      const w = box.clientWidth,
        h = box.clientHeight,
        iw = Math.min(w, h * layout.posterAspect),
        ih = iw / layout.posterAspect;
      const scale = mobile ? 1.4 : (h / ih) * 1.15;
      box.style.setProperty("--poster-scale", scale);
      for (const [id, uv] of [
        ...layout.keys.map((k) => [k.name, k.posterUV]),
        ["knob", layout.knobUV],
      ]) {
        const el = hits.current[id];
        if (el) {
          el.style.left =
            ((w - iw) / 2 + uv[0] * iw - w / 2) * scale + w / 2 + "px";
          el.style.top =
            ((h - ih) / 2 + uv[1] * ih - h / 2) * scale + h / 2 + "px";
        }
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    box.__modelObserver = observer;
    return () => {
      dead = true;
      root.current?.__modelObserver?.disconnect();
    };
  }, [layout, mobile, ready]);
  return (
    <div
      className={`premium-pad real-pad ${mobile || failed ? "poster-mode" : ""}`}
      ref={root}
      data-model-ready={mobile ? "poster" : ready ? "webgl" : "loading"}
      data-knob-angle={angle}
    >
      {(!ready || mobile) && poster}
      {!mobile && (
        <ModelBoundary
          poster={poster}
          onError={() => {
            setFailed(true);
            setReady(false);
          }}
        >
          <Suspense fallback={null}>
            <Scene
              layout={layout}
              keys={keys}
              device={mirrorDevice}
              pending={pending}
              status={live.status}
              chart={live.chart}
              angle={angle}
              pressed={pressed}
              reduced={!!reduced}
              hitRefs={hits}
              root={root}
              onKey={onKey}
              onKnob={onKnob}
              onReady={() => setReady(true)}
            />
          </Suspense>
        </ModelBoundary>
      )}
      <div className="model-access" aria-label="Real pad controls">
        {Array.from({ length: 14 }, (_, i) => {
          const k = keys[i];
          return (
            <button
              key={i}
              ref={(el) =>
                (hits.current["key-" + String(i + 1).padStart(2, "0")] = el)
              }
              className="physical-key model-hit"
              disabled={!k}
              aria-label={
                "Configure key " + (i + 1) + ": " + (k?.label || "Unavailable")
              }
              onClick={() => k && onKey(k)}
              title={k?.label}
            >
              <span>{k?.label || "Unavailable"}</span>
            </button>
          );
        })}
        <button
          className="model-knob-hit model-hit"
          ref={(el) => (hits.current.knob = el)}
          aria-label="Configure size knob"
          onClick={onKnob}
        >
          <span>Size knob</span>
        </button>
      </div>
      <span className="sr-only" role="status" aria-label="Live pad screen">
        {device
          ? pending
            ? `CONFIRM ${pending.proposal.signal.symbol}; ${Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000))}s`
            : `${device.status.market || "--"} ${device.status.armed ? "ARMED" : "STOPPED"}`
          : "xorr-pad · OFFLINE · Setup required: connect your pad"}
      </span>
    </div>
  );
}
