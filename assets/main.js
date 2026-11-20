// Interactive parts of index.html: the TV wall scene in Music mode (runs on assets/dc-lite.js + assets/scene.js)
class Component extends GlowScene {
renderVals(){ return { ...this.common('Three zones, one song: the TV glow stays calm while the speakers hit on the beat.'), ...this.room() }; }
}
DC.mount(Component, {"accent": "#8ea6ff"});
