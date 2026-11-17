// Interactive parts of index.html (runs on assets/dc-lite.js)
class Component extends DCLogic {
constructor(props){ super(props); this.state = { t: 0, playing: false }; this.ang = 0; this.spd = 0.5; this.spark = 0; this.level = 0.15; this.beat = 0; this.hue = 0; this.last = 0; }
componentDidMount(){ const loop = now => { this.frame(now); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
componentWillUnmount(){ cancelAnimationFrame(this.raf); this.stopAudio(); }
frame(now){
  const dt = Math.min(0.1, (now - (this.last || now)) / 1000); this.last = now;
  if(this.an){ // listening to the demo beat, the same way /Glow listens to the car
    const f = this.freq; this.an.getByteFrequencyData(f);
    let bass = 0, all = 0; for(let i = 0; i < 6; i++) bass += f[i]; for(let i = 0; i < 128; i++) all += f[i];
    bass /= 6 * 255; all /= 128 * 255;
    this.peak = Math.max((this.peak || 0.3) * 0.995, all, 0.05);
    this.level += (Math.min(1, all / this.peak) - this.level) * 0.35;
    if(bass > (this.avg || 0.3) * 1.25 && now - (this.lastBeat || 0) > 220){ this.beat = 1; this.lastBeat = now; this.hue = (this.hue + 47) % 360; }
    this.avg = (this.avg || 0.3) * 0.95 + bass * 0.05;
  } else { // demo mode: slow drift and the odd sparkle
    this.level = 0.18 + 0.1 * Math.sin(now / 1400); this.hue = (this.hue + dt * 12) % 360;
  }
  this.beat *= 0.86;
  const target = Math.min(3.2, 0.45 + 3.2 * this.level + 1.2 * this.beat);
  this.spd += (target - this.spd) * Math.min(1, dt * 3); this.ang += this.spd * dt;
  if(this.spark <= 0.02 && Math.random() < dt * (0.25 + 2.5 * this.level) + (this.beat > 0.8 ? 0.2 : 0)){ this.spark = 0.55 + 0.45 * Math.max(this.level, this.beat); this.spot = [[0, 0], [-15, 4], [-3, 15]][Math.floor(Math.random() * 3)]; }
  this.spark = Math.max(0, this.spark - dt * 2.4);
  this.setState({ t: now });
}
startAudio(){
  const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
  const ctx = this.ctx = new AC(), out = ctx.createGain(); out.gain.value = 0.18;   // a comfortable, low volume
  const an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.5; out.connect(an); an.connect(ctx.destination);
  this.an = an; this.freq = new Uint8Array(an.frequencyBinCount);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate), nd = noise.getChannelData(0); for(let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const bpm = 104, step = 60 / bpm / 4, bassLine = [36, 0, 36, 0, 43, 0, 41, 0, 36, 0, 36, 39, 0, 41, 43, 0], chords = [[60, 63, 67], [58, 62, 65], [56, 60, 63], [58, 62, 65]];
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  let n = 0, t = ctx.currentTime + 0.1;
  const play = (at, i) => {
    if(i % 4 === 0){ const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.18); g.gain.setValueAtTime(1, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.3); o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.32); }
    if(i % 8 === 4){ const b = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); b.buffer = noise; f.type = 'bandpass'; f.frequency.value = 1800; g.gain.setValueAtTime(0.5, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.15); b.connect(f); f.connect(g); g.connect(out); b.start(at); }
    if(i % 2 === 1){ const b = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); b.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(0.18, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.05); b.connect(f); f.connect(g); g.connect(out); b.start(at); }
    const bn = bassLine[i % 16]; if(bn){ const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = hz(bn); f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(0.35, at); g.gain.exponentialRampToValueAtTime(0.001, at + step * 1.8); o.connect(f); f.connect(g); g.connect(out); o.start(at); o.stop(at + step * 2); }
    if(i % 16 === 0){ chords[(i / 16) % 4].forEach(cn => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = hz(cn); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.06, at + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, at + step * 15); o.connect(g); g.connect(out); o.start(at); o.stop(at + step * 16); }); }
  };
  this.timer = setInterval(() => { while(t < ctx.currentTime + 0.25){ play(t, n % 64); n++; t += step; } }, 50);
}
stopAudio(){ clearInterval(this.timer); this.timer = null; if(this.ctx){ try{ this.ctx.close(); }catch(e){} } this.ctx = null; this.an = null; }
renderVals(){
  const accent = this.props.accent ?? '#8ea6ff', playing = this.state.playing;
  const meridians = [0, 1, 2, 3].map(k => { const th = this.ang + k * Math.PI / 2, front = Math.cos(th), bulge = 8 * Math.sin(th);
    return { d: `M12 5Q${(12 + 2 * bulge).toFixed(2)} 13 12 21`, op: front > 0 ? Math.min(1, front * 2.2).toFixed(2) : '0' }; });
  const k = Math.sin(Math.min(1, this.spark / 0.55) * Math.PI / 2), sp = this.spot || [0, 0];
  const strip = Array.from({length: 12}, (_, i) => { const d = Math.abs(i - 5.5) / 5.5, lv = Math.max(0.12, Math.min(1, this.level * 1.1 + this.beat * (1 - d) * 0.8));
    const h = playing ? (this.hue + i * 6) % 360 : 228 + 20 * Math.sin(this.ang + i * 0.5);
    return { c: `hsl(${h.toFixed(0)} 95% ${(18 + 50 * lv).toFixed(0)}%)`, g: (4 + 16 * lv).toFixed(0) }; });
  return {
    accent, meridians,
    ballColor: playing ? `hsl(${this.hue.toFixed(0)} 90% 72%)` : accent,
    glow: (4 + 14 * Math.max(this.level, this.beat)).toFixed(1),
    sparkOp: k.toFixed(2), sparkT: `translate(${sp[0] * 0.6} ${sp[1] * 0.6}) translate(20.5 4) scale(${(0.5 + 0.7 * k).toFixed(2)}) translate(-20.5 -4)`,
    strip,
    btnLabel: playing ? '■  Stop the beat' : '▶  Play a demo beat',
    btnBg: playing ? '#151922' : accent, btnFg: playing ? '#e9ecf3' : '#0b0d12',
    caption: playing ? '/Glow is listening: louder spins faster, beats sparkle.' : 'Demo mode. The beat is made in your browser at a low volume.',
    toggle: () => { if(this.state.playing){ this.stopAudio(); this.setState({ playing: false }); } else { this.startAudio(); this.setState({ playing: true }); } },
  };
}
}
DC.mount(Component, {"accent": "#8ea6ff"});
