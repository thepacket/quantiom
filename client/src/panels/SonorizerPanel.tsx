import { useEffect, useMemo, useRef, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell } from "./PanelShell";
import { SynthEngine } from "./SynthEngine";

type Props = { state: SimState };

const DEFAULT_BASE_FREQ = 220; // A3
const DEFAULT_VOLUME = 0.25;

export function SonorizerPanel({ state }: Props) {
  const data = dataOf(state);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [baseFreq, setBaseFreq] = useState(DEFAULT_BASE_FREQ);
  const engineRef = useRef<SynthEngine | null>(null);

  // Build/destroy the engine on play toggle.
  useEffect(() => {
    if (playing && !engineRef.current) {
      engineRef.current = new SynthEngine(baseFreq);
    }
    if (engineRef.current) {
      engineRef.current.setMasterGain(playing ? volume : 0);
      if (playing) void engineRef.current.resume();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    engineRef.current?.setMasterGain(playing ? volume : 0);
  }, [volume, playing]);

  useEffect(() => {
    engineRef.current?.setBaseFrequency(baseFreq);
  }, [baseFreq]);

  // Push amplitudes on every data update.
  useEffect(() => {
    if (!engineRef.current || !data) return;
    const amps: Array<readonly [number, number]> = data.amplitudes.map((a) => [
      a.re ?? 0,
      a.im ?? 0,
    ]);
    engineRef.current.setAmplitudes(amps);
  }, [data]);

  useEffect(() => () => engineRef.current?.destroy(), []);

  const partialCount = useMemo(() => {
    if (!data) return 0;
    return data.amplitudes.filter((a) => Math.hypot(a.re ?? 0, a.im ?? 0) > 1e-6).length;
  }, [data]);

  const symbolic = data?.amplitudes.some((a) => a.re === null) ?? false;

  return (
    <PanelShell id="sonorizer" title="Sonorizer">
      {symbolic ? (
        <div className="panel__placeholder">set symbolic parameters to hear the state</div>
      ) : (
        <div className="sono__body">
          <div className="sono__row sono__row--top">
            <button
              className={"sono__play" + (playing ? " sono__play--on" : "")}
              onClick={() => setPlaying((p) => !p)}
              title={playing ? "Stop" : "Play"}
            >
              {playing ? "■" : "▶"}
            </button>
            <div className="sono__meta">
              <div>
                {partialCount} partial{partialCount === 1 ? "" : "s"} active
              </div>
              <div className="sono__hint">
                each |i⟩ → harmonic (i+1) of {baseFreq.toFixed(0)} Hz
              </div>
            </div>
          </div>
          <div className="sono__row">
            <label className="sono__label">vol</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="sono__slider"
            />
            <span className="sono__num">{volume.toFixed(2)}</span>
          </div>
          <div className="sono__row">
            <label className="sono__label">f₀</label>
            <input
              type="range"
              min={55}
              max={880}
              step={1}
              value={baseFreq}
              onChange={(e) => setBaseFreq(parseInt(e.target.value, 10))}
              className="sono__slider"
            />
            <span className="sono__num">{baseFreq}Hz</span>
          </div>
        </div>
      )}
    </PanelShell>
  );
}
