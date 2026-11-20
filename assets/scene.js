// The Music section's live scene (home: a TV wall at night; cars: a mirror ball), driven by a demo beat
// that always runs (silent until Sound on) through three pedals: Fuzz, Rotary and Echo. Runs on assets/dc-lite.js;
// main.js (home) and cars.js (cars) pick the scene. Designed on the "/Glow Music section" canvas.
class GlowScene extends DCLogic {
constructor(props){ super(props);
  this.state = { t: 0, sound: false, fuzz: false, rot: false, echo: false };
  this.fx = { fuzz: 0.6, rot: 0.5, echo: 0.55 };      // slider positions, 0–1
  this.level = 0.3; this.beat = 0; this.hue = 228; this.ang = 0; this.spd = 0.4; this.last = 0; this.scale = 1; this.visible = true;
  this.hits = []; this.step = -1; this.t0 = null; this.phase = 0; }
componentDidMount(){
  const box = document.getElementById('glowScene');
  if(box){
    const fit = () => { this.scale = Math.min(1, box.clientWidth / 512) || 1; };
    fit(); if(window.ResizeObserver) new ResizeObserver(fit).observe(box); else addEventListener('resize', fit);
    if(window.IntersectionObserver) new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }).observe(box);
  }
  const loop = now => { this.frame(now); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop);
}
componentWillUnmount(){ cancelAnimationFrame(this.raf); this.stopAudio(); }
// The demo beat always runs (silently until Sound on); the lights follow its kick and snare the way /Glow follows a song.
hit(now, a){ this.hits.push({ t: now, a });
  if(this.state.echo){ const fb = 0.25 + 0.6 * this.fx.echo; for(let k = 1, amp = a * fb; k <= 8 && amp > 0.06; k++, amp *= fb) this.hits.push({ t: now + k * 380, a: amp }); } }
frame(now){
  const dt = Math.min(0.1, (now - (this.last || now)) / 1000); this.last = now;
  const sd = 60 / 104 / 4; if(this.t0 == null) this.t0 = now;
  const st = Math.floor((now - this.t0) / 1000 / sd);
  if(st !== this.step){ for(let s = Math.max(this.step + 1, st - 3); s <= st; s++){ const i = ((s % 64) + 64) % 64;
      if(i % 4 === 0){ this.hit(now, 1); if(i % 8 === 0) this.hue = (this.hue + 47) % 360; }
      if(i % 8 === 4) this.hit(now, 0.55); }
    this.step = st; }
  let raw = 0; this.hits = this.hits.filter(h => now - h.t < 1500);
  for(const h of this.hits){ if(h.t <= now) raw = Math.max(raw, h.a * Math.exp(-(now - h.t) / 130)); }
  let b = raw;
  if(this.state.fuzz){ const g = this.fx.fuzz; b = Math.min(1, raw * (1 + 3 * g)); if(raw > 0.12) b *= 1 - g * 0.4 * Math.random(); }   // slam and sputter
  this.beat = b;
  this.level += (0.3 + 0.55 * raw - this.level) * Math.min(1, dt * 6);
  this.phase += dt * 2 * Math.PI * (this.state.rot ? 0.4 + 5.6 * this.fx.rot : 0);
  const target = Math.min(3, 0.35 + 1.6 * this.level + 0.8 * this.beat) * (this.state.rot ? 1 + 2.5 * this.fx.rot : 1);
  this.spd += (target - this.spd) * Math.min(1, dt * 3); this.ang += this.spd * dt;
  if(this.visible) this.setState({ t: now });   // off screen: keep time, skip drawing
}
// Rotary: a swirl between zones (k = zone), like a Leslie speaker sweeping the room.
sweep(k){ return this.state.rot ? 0.5 + 0.5 * Math.sin(this.phase + k * 2.1) : 1; }
startAudio(){
  const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
  const ctx = this.ctx = new AC(), out = ctx.createGain(); out.gain.value = 1;
  const shaper = this.shaper = ctx.createWaveShaper(), trem = this.trem = ctx.createGain(), lfo = this.lfo = ctx.createOscillator(), lfoAmt = this.lfoAmt = ctx.createGain();
  const master = ctx.createGain(); master.gain.value = 0.16;                  // a comfortable, low volume
  const delay = this.delay = ctx.createDelay(1.5), fb = this.fb = ctx.createGain(), wet = this.wet = ctx.createGain(); delay.delayTime.value = 0.38;
  out.connect(shaper); shaper.connect(trem); trem.connect(master); master.connect(ctx.destination);
  master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination);
  lfo.connect(lfoAmt); lfoAmt.connect(trem.gain); lfo.start();
  this.applyFx();
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate), nd = noise.getChannelData(0); for(let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const step = 60 / 104 / 4, bassLine = [36, 0, 36, 0, 43, 0, 41, 0, 36, 0, 36, 39, 0, 41, 43, 0], chords = [[60, 63, 67], [58, 62, 65], [56, 60, 63], [58, 62, 65]];
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  // start in step with the beat the lights are already following
  const pos = (performance.now() - this.t0) / 1000 / step; let n = Math.ceil(pos), t = ctx.currentTime + (n - pos) * step + 0.03;
  const play = (at, i) => {
    if(i % 4 === 0){ const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.18); g.gain.setValueAtTime(1, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.3); o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.32); }
    if(i % 8 === 4){ const b = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); b.buffer = noise; f.type = 'bandpass'; f.frequency.value = 1800; g.gain.setValueAtTime(0.5, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.15); b.connect(f); f.connect(g); g.connect(out); b.start(at); }
    if(i % 2 === 1){ const b = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); b.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(0.18, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.05); b.connect(f); f.connect(g); g.connect(out); b.start(at); }
    const bn = bassLine[i % 16]; if(bn){ const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = hz(bn); f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(0.35, at); g.gain.exponentialRampToValueAtTime(0.001, at + step * 1.8); o.connect(f); f.connect(g); g.connect(out); o.start(at); o.stop(at + step * 2); }
    if(i % 16 === 0){ chords[(i / 16) % 4].forEach(cn => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = hz(cn); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.06, at + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, at + step * 15); o.connect(g); g.connect(out); o.start(at); o.stop(at + step * 16); }); }
  };
  this.timer = setInterval(() => { while(t < ctx.currentTime + 0.25){ play(t, ((n % 64) + 64) % 64); n++; t += step; } }, 50);
}
// The same three pedals on the sound, when it's on
applyFx(){ const ctx = this.ctx; if(!ctx) return; const S = this.state, now = ctx.currentTime;
  if(S.fuzz){ const k = 4 + 60 * this.fx.fuzz, c = new Float32Array(1024); for(let i = 0; i < 1024; i++){ const x = i / 511.5 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)) * 0.7; } this.shaper.curve = c; } else this.shaper.curve = null;
  this.lfo.frequency.setTargetAtTime(0.4 + 5.6 * this.fx.rot, now, 0.05); this.lfoAmt.gain.setTargetAtTime(S.rot ? 0.45 : 0, now, 0.05); this.trem.gain.setTargetAtTime(S.rot ? 0.55 : 1, now, 0.05);
  this.fb.gain.setTargetAtTime(S.echo ? 0.25 + 0.55 * this.fx.echo : 0, now, 0.05); this.wet.gain.setTargetAtTime(S.echo ? 0.45 : 0, now, 0.05); }
stopAudio(){ clearInterval(this.timer); this.timer = null; if(this.ctx){ try{ this.ctx.close(); }catch(e){} } this.ctx = null; }
common(){
  const S = this.state, sound = S.sound;
  const stomp = key => () => { this.setState({ [key]: !this.state[key] }); this.applyFx(); };
  const set = key => e => { this.fx[key] = +e.target.value / 100; this.applyFx(); };
  const led = (on, c) => `width: 10px; height: 10px; border-radius: 50%; background: ${on ? c : '#2a3142'}; box-shadow: ${on ? `0 0 10px ${c}` : 'none'}`;
  const sw = on => `width: 46px; height: 46px; border-radius: 50%; cursor: pointer; border: 2px solid ${on ? '#e9ecf3' : '#8b93a7'}; background: radial-gradient(circle at 35% 30%, #f4f6fa, #8b93a7 75%); box-shadow: ${on ? '0 1px 0 #3a4360' : '0 4px 0 #3a4360'}; transform: translateY(${on ? 3 : 0}px)`;
  const any = S.fuzz || S.rot || S.echo;
  return {
    sceneT: `position: absolute; left: 0; top: 0; width: 512px; height: 340px; transform-origin: 0 0; transform: scale(${this.scale.toFixed(4)})`,
    soundLabel: sound ? 'Sound on' : 'Sound off', soundOn: String(sound),
    soundIcon: sound ? 'M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z' : 'M3 9v6h4l5 4V5L7 9H3zm13.6 0l-1.4 1.4L16.8 12l-1.6 1.6 1.4 1.4 1.6-1.6 1.6 1.6 1.4-1.4-1.6-1.6 1.6-1.6-1.4-1.4-1.6 1.6z',
    soundStyle: `font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; min-height: 44px; display: inline-flex; align-items: center; gap: 8px; padding: 0 16px; border-radius: 999px; border: 1px solid #3a4360; background: ${sound ? '#8ea6ff' : '#151922'}; color: ${sound ? '#0b0d12' : '#e9ecf3'}`,
    toggleSound: () => { if(this.state.sound){ this.stopAudio(); this.setState({ sound: false }); } else { this.startAudio(); this.setState({ sound: true }); } },
    caption: any ? 'Try the sliders. The lights change the moment you do.' : 'The beat is playing silently. Stomp a pedal to change the lights, or turn the sound on.',
    fuzzOn: String(S.fuzz), rotOn: String(S.rot), echoOn: String(S.echo),
    fuzzLed: led(S.fuzz, '#ff4f6d'), rotLed: led(S.rot, '#3ad07a'), echoLed: led(S.echo, '#1fb8a8'),
    fuzzSw: sw(S.fuzz), rotSw: sw(S.rot), echoSw: sw(S.echo),
    fuzzStomp: stomp('fuzz'), rotStomp: stomp('rot'), echoStomp: stomp('echo'),
    fuzzSet: set('fuzz'), rotSet: set('rot'), echoSet: set('echo'),
  };
}
// Home: a TV wall at night. Cove light, TV backlight and two speaker uplights as separate zones.
// Fuzz makes the uplights slam, Rotary swirls light between them and the cove, Echo repeats each hit.
room(){
  const playing = true, lv = this.level, bt = this.beat;
  this.calm = this.calm == null ? this.hue : this.calm + (((this.hue - this.calm + 540) % 360) - 180) * 0.01;
  const h1 = playing ? (this.hue + 40) % 360 : 262, h2 = playing ? this.calm : 222, h3 = playing ? this.hue : 200;
  const c1 = `hsl(${h1.toFixed(0)} 85% 62%)`, c2 = `hsl(${h2.toFixed(0)} 80% 58%)`, c3 = `hsl(${h3.toFixed(0)} 95% 62%)`;
  const sp = Math.max(lv * 0.55, bt), up = (side, k) => `position: absolute; ${side}: -36px; top: -12px; width: 192px; height: 182px; background: radial-gradient(ellipse 45% 70% at 50% 100%, ${c3} 0%, transparent 72%); opacity: ${((0.12 + 0.88 * sp) * this.sweep(k)).toFixed(2)}; filter: blur(6px)`;
  return {
    coveLine: `position: absolute; left: 0; right: 0; top: 0; height: 3px; background: ${c1}; box-shadow: 0 0 12px 2px ${c1}; opacity: ${((0.55 + 0.45 * lv) * (0.4 + 0.6 * this.sweep(1))).toFixed(2)}`,
    coveGlow: `position: absolute; left: 4%; width: 92%; top: -70px; height: 150px; border-radius: 50%; background: ${c1}; filter: blur(42px); opacity: ${((0.18 + 0.3 * lv) * (0.4 + 0.6 * this.sweep(1))).toFixed(2)}`,
    tvGlow: `position: absolute; left: 50%; top: 58px; width: 290px; height: 166px; transform: translateX(-50%); border-radius: 30px; background: ${c2}; filter: blur(34px); opacity: ${(0.42 + 0.12 * lv).toFixed(2)}`,
    upL: up('left', 0), upR: up('right', Math.PI / 2.1),
    floor: `position: absolute; left: 0; right: 0; bottom: -30px; height: 70px; background: radial-gradient(ellipse 60% 100% at 50% 0%, ${c3} 0%, transparent 70%); opacity: ${(0.08 + 0.3 * sp).toFixed(2)}; filter: blur(14px)`,
  };
}
// Cars: a mirror ball. Rotary spins it faster; Fuzz and Echo shape the flashes.
// Mirror ball: Rings get fewer tiles toward the poles (tiles stay square); highlights brighten smoothly.
ball(){
  const playing = true, lv = this.level, bt = this.beat, R = 100, ang = this.ang;
  const hue = playing ? this.hue : 228, sat = playing ? 85 : 45;
  const L = [-0.45, 0.55, 0.7], Ln = Math.hypot(...L), l = L.map(x => x / Ln), H = [l[0], l[1], l[2] + 1], Hn = Math.hypot(...H), hh = H.map(x => x / Hn);
  const tiles = [], bands = 14, dLat = Math.PI / bands;
  for(let i = 0; i < bands; i++){ const lat = -Math.PI / 2 + (i + 0.5) * dLat; const cl = Math.cos(lat), sl = Math.sin(lat); const segs = Math.max(5, Math.round(2 * Math.PI * cl / dLat)), dLon = 2 * Math.PI / segs;
    const y0 = -R * Math.sin(lat + dLat / 2), y1 = -R * Math.sin(lat - dLat / 2);
    for(let j = 0; j < segs; j++){ const lon = j * dLon + ang * 0.6 + i * 0.37; const z = cl * Math.cos(lon); if(z <= 0.05) continue;
      const xa = R * cl * Math.sin(lon - dLon / 2), xb = R * cl * Math.sin(lon + dLon / 2); if(xb <= xa) continue;
      const n = [cl * Math.sin(lon), sl, z], dif = Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]), spec = Math.pow(Math.max(0, n[0] * hh[0] + n[1] * hh[1] + n[2] * hh[2]), 60);
      const shine = Math.min(1, spec * 1.6 + bt * 0.25 * dif * dif);
      const li = Math.min(84, 10 + 46 * dif + 28 * shine), hT = (hue + (lon * 16) % 360) % 360;
      const col = `hsl(${hT.toFixed(0)} ${(12 + (playing ? 18 : 6) * dif + 10 * shine).toFixed(0)}% ${li.toFixed(0)}%)`;
      tiles.push({ st: `position: absolute; left: ${(xa + 0.6).toFixed(1)}px; top: ${(y0 + 0.6).toFixed(1)}px; width: ${Math.max(0.6, xb - xa - 1.2).toFixed(1)}px; height: ${Math.max(0.6, y1 - y0 - 1.2).toFixed(1)}px; background: ${col}; border-radius: 1px${shine > 0.45 ? `; box-shadow: 0 0 ${(3 + 4 * shine).toFixed(1)}px hsl(${hT.toFixed(0)} 60% 75% / ${(0.5 * shine).toFixed(2)})` : ''}` }); } }
  const specks = Array.from({length: 40}, (_, k) => { const a = k * 2.399 + ang * (0.6 + (k % 3) * 0.08), e = ((k * 37) % 100) / 100;
    const x = 256 + 300 * Math.sin(a) * (0.55 + 0.45 * e), y = 30 + 280 * (((k * 53) % 100) / 100) + 18 * Math.sin(a * 0.5), front = Math.cos(a);
    if(front < -0.1 || Math.hypot(x - 256, y - 150) < 112) return { st: 'display: none' };
    const sz = 3 + (k % 4) * 1.5, op = Math.min(1, (0.15 + 0.85 * Math.max(lv, bt * 0.8)) * (0.35 + 0.65 * front)), hS = (hue + k * 9) % 360;
    return { st: `position: absolute; left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px; width: ${sz}px; height: ${(sz * 0.7).toFixed(1)}px; border-radius: 50%; background: hsl(${hS.toFixed(0)} ${sat}% 88%); box-shadow: 0 0 ${(4 + 8 * lv).toFixed(0)}px 1px hsl(${hS.toFixed(0)} ${sat}% 70%); opacity: ${op.toFixed(2)}` }; });
  const strip = Array.from({length: 16}, (_, i) => { const d = Math.abs(i - 7.5) / 7.5, v = Math.max(0.12, Math.min(1, lv * 1.1 + bt * (1 - d) * 0.8)); const h = playing ? (hue + i * 6) % 360 : 228 + 20 * Math.sin(ang + i * 0.5);
    const c = `hsl(${h.toFixed(0)} 95% ${(18 + 50 * v).toFixed(0)}%)`; return { st: `flex: 1; height: 6px; border-radius: 3px; background: ${c}; box-shadow: 0 0 ${(4 + 14 * v).toFixed(0)}px ${c}` }; });
  return { tiles, specks, strip,
    halo: `position: absolute; left: 76px; top: -30px; width: 360px; height: 360px; border-radius: 50%; background: radial-gradient(circle, hsl(${hue.toFixed(0)} ${sat}% 60% / ${(0.18 + 0.32 * Math.max(lv, bt)).toFixed(2)}) 0%, transparent 62%)` };
}
}
window.GlowScene = GlowScene;
