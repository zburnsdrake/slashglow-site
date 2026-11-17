// Interactive parts of community.html (runs on assets/dc-lite.js)
class Component extends DCLogic {
constructor(props){ super(props); this.state = { loc: 'all', kind: 'all' }; }
renderVals(){
  const accent = this.props.accent ?? '#8ea6ff';
  const LOCS = [['all','All places'],['car','Cars & trucks'],['home','Home'],['ent','Entertainment center'],['holiday','Holiday'],['cab','Cabinets & shelves'],['display','Display cases'],['bar','Man cave & bar'],['store','Storefronts'],['rest','Restaurants']];
  const KINDS = [['all','Everything'],['Look','Looks'],['Rig','Rigs'],['Scene','Scenes']];
  const by = '/Glow starter';
  const ITEMS = [
    {name:'Flame Top', kind:'Look', loc:'bar', pro:true, desc:'A slow ember drift that flares with the music.', c:['#ff5a14','#ffb03a','#ff5a14']},
    {name:'Doom', kind:'Rig', loc:'bar', pro:true, desc:'Fuzz into a rotary: heavy hits that spin.', c:['#ff0080','#ffee00','#00e5ff']},
    {name:'Great Gig', kind:'Rig', loc:'ent', pro:true, desc:'Phaser, echo and a long verb tail for big, slow songs.', c:['#5a10ff','#60f0ff']},
    {name:'Party', kind:'Look', loc:'ent', pro:false, desc:'Four colors that jump on every beat.', c:['#ff0080','#00e5ff','#8000ff','#ffee00']},
    {name:'Aurora drift', kind:'Look', loc:'home', pro:false, desc:'Teal that wanders in hue with soft, random swells.', c:['#00d0a0','#00a0d0','#30f0b0']},
    {name:'Slow sunrise', kind:'Scene', loc:'home', pro:false, desc:'Welcome: a warm fade up from nothing.', c:['#1a0a00','#ff7a3d','#ffd090']},
    {name:'Rainbow bursts', kind:'Look', loc:'holiday', pro:false, desc:'A new hue with every burst.', c:['#ff0000','#ffee00','#00ff40','#0030ff','#c000ff']},
    {name:'Heartbeat', kind:'Look', loc:'display', pro:false, desc:'A slow double pulse that draws the eye.', c:['#3a0010','#ff1040','#3a0010']},
    {name:'Violet run + breathe', kind:'Look', loc:'store', pro:false, desc:'A chase down the strip with a slow breathe on top.', c:['#2a1050','#c890ff','#2a1050']},
    {name:'Beacon', kind:'Scene', loc:'store', pro:false, desc:'Welcome: bright pulses that call attention, then settle.', c:['#ffffff','#5ad1ff','#0b0d12']},
    {name:'Sunset', kind:'Look', loc:'rest', pro:false, desc:'Amber easing to rose: warm and low for dinner.', c:['#ffb060','#ff6a3d','#c03070']},
    {name:'Night drive', kind:'Look', loc:'car', pro:false, desc:'A dim, steady violet that stays out of your eyes.', c:['#1a0a40','#5a30c0','#1a0a40']},
    {name:'Time traveler', kind:'Look', loc:'car', pro:false, desc:'Blue to white with a materialize welcome.', c:['#0040ff','#00e5ff','#e6fbff']},
    {name:'Ignite', kind:'Scene', loc:'car', pro:false, desc:'Welcome: a quick bright flare that settles into your look.', c:['#ff5a14','#ffffff','#ff5a14']},
  ];
  const locName = id => (LOCS.find(l => l[0] === id) || [id, id])[1];
  const inKind = it => this.state.kind === 'all' || it.kind === this.state.kind;
  const shown = ITEMS.filter(it => (this.state.loc === 'all' || it.loc === this.state.loc) && inKind(it)).map(it => ({
    name: it.name, kind: it.kind, loc: locName(it.loc), pro: it.pro, desc: it.desc, by,
    bar: `linear-gradient(90deg, ${it.c.join(', ')})`, glow: it.c[Math.floor(it.c.length / 2)] }));
  const locs = LOCS.map(([id, label]) => { const sel = this.state.loc === id, n = ITEMS.filter(it => (id === 'all' || it.loc === id) && inKind(it)).length;
    return { label, n: String(n), pressed: sel ? 'true' : 'false', bg: sel ? accent : '#151922', fg: sel ? '#0b0d12' : '#c3cada', border: sel ? accent : '#2a3142', pick: () => this.setState({ loc: id }) }; });
  const kinds = KINDS.map(([id, label]) => { const sel = this.state.kind === id;
    return { label, pressed: sel ? 'true' : 'false', bg: sel ? '#2a3142' : 'transparent', fg: sel ? '#f2f4f8' : '#a3abbd', pick: () => this.setState({ kind: id }) }; });
  const where = this.state.loc === 'all' ? 'every kind of place' : locName(this.state.loc);
  return {
    accent, locs, kinds, shown,
    hasItems: shown.length > 0, empty: shown.length === 0,
    countLine: `${shown.length} share${shown.length === 1 ? '' : 's'} for ${where}`,
    emptyTitle: `Nothing shared for ${where} yet.`,
  };
}
}
DC.mount(Component, {"accent": "#8ea6ff"});
