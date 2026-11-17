// Reproductor de canciones con planificador anticipado (estable a cualquier velocidad y en bucle).
import { audioCtx, createBus, playMidi, playChord, guacharaca, caja } from './audio.js';
import { METERS, ticksPerMeasure } from './rhythm.js';
import { bassMidis } from './song.js';

export class SongPlayer {
  constructor(song, { onTick, onEnd } = {}) {
    this.song = song;
    this.onTick = onTick || (() => {});
    this.onEnd = onEnd || (() => {});
    this.playing = false;
    this.opts = { speed: 1, metronome: true, melody: true, bass: true, loop: false, countIn: true };
  }

  get tickDur() {
    return 60 / (this.song.bpm * METERS[this.song.meter].ticksPerBeat) / this.opts.speed;
  }

  /** Tick actual (fraccionario) de la reproducción. */
  get tick() {
    if (!this.playing) return this._pausedAt ?? 0;
    const c = audioCtx();
    return this.from + Math.max(0, c.currentTime - this.t0) / this.tickDur;
  }

  play({ from = 0, to = null, ...opts } = {}) {
    this.stop(false);
    Object.assign(this.opts, opts);
    const s = this.song, tpm = ticksPerMeasure(s.meter), tpb = METERS[s.meter].ticksPerBeat;
    this.from = from;
    this.to = to ?? s.measures * tpm;
    const c = audioCtx();
    this.bus = createBus(1);
    this.playing = true;
    const countTicks = this.opts.countIn ? tpm : 0;
    this.t0 = c.currentTime + 0.12 + countTicks * this.tickDur;
    // Cuenta previa: un compás de guacharaca
    for (let k = 0; k < countTicks; k += tpb) guacharaca(this.t0 - (countTicks - k) * this.tickDur, { strong: k === 0, dest: this.bus });
    this._build();
    this.timer = setInterval(() => this._schedule(), 25);
    this._schedule();
    const loop = () => {
      if (!this.playing) return;
      this.onTick(this.tick);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  _build() {
    const s = this.song, tpb = METERS[s.meter].ticksPerBeat, tpm = ticksPerMeasure(s.meter);
    const ev = [];
    if (this.opts.melody) s.notes.forEach((n) => { if (n.tick >= this.from && n.tick < this.to) ev.push({ tick: n.tick, type: 'n', n }); });
    if (this.opts.bass) s.bass.forEach((b) => { if (b.tick >= this.from && b.tick < this.to) ev.push({ tick: b.tick, type: 'b', b }); });
    if (this.opts.metronome) {
      for (let t = Math.ceil(this.from / tpb) * tpb; t < this.to; t += tpb) {
        ev.push({ tick: t, type: t % tpm === 0 ? 'downbeat' : 'beat' });
        // guacharaca en la subdivisión intermedia (el "chiqui" del pulso)
        if (tpb === 4) ev.push({ tick: t + 2, type: 'sub' });
      }
    }
    ev.sort((a, b) => a.tick - b.tick);
    this.events = ev;
    this.idx = 0;
  }

  _schedule() {
    if (!this.playing) return;
    const c = audioCtx(), horizon = c.currentTime + 0.2, td = this.tickDur;
    while (this.idx < this.events.length) {
      const e = this.events[this.idx];
      const at = this.t0 + (e.tick - this.from) * td;
      if (at > horizon) break;
      if (at >= c.currentTime - 0.02) {
        if (e.type === 'n') playMidi(e.n.midi, Math.max(0.08, e.n.dur * td * 0.97), { at, dest: this.bus, gain: 0.45 });
        else if (e.type === 'b') {
          const ms = bassMidis(e.b);
          if (ms.length === 1) playMidi(ms[0], Math.min(0.35, e.b.dur * td), { at, dest: this.bus, bass: true, gain: 0.5 });
          else playChord(ms, Math.min(0.3, e.b.dur * td), { at, dest: this.bus, bass: true });
        } else if (e.type === 'downbeat') { caja(at, { dest: this.bus }); guacharaca(at, { strong: true, dest: this.bus }); }
        else if (e.type === 'beat') guacharaca(at, { strong: true, dest: this.bus });
        else guacharaca(at, { dest: this.bus });
      }
      this.idx++;
    }
    const endAt = this.t0 + (this.to - this.from) * td;
    if (c.currentTime >= endAt) {
      if (this.opts.loop) {
        this.t0 = endAt;
        this.opts.countIn = false;
        this._build();
      } else {
        this.stop(true);
      }
    }
  }

  stop(ended = false) {
    if (!this.playing) return;
    this._pausedAt = this.tick;
    this.playing = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    if (this.bus) { const b = this.bus; b.gain.setTargetAtTime(0, audioCtx().currentTime, 0.02); setTimeout(() => b.disconnect(), 150); }
    if (ended) this.onEnd();
  }
}
