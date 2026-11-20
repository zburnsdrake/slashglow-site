// Interactive parts of index.html: the TV wall scene in Music mode (runs on assets/dc-lite.js + assets/scene.js)
class Component extends GlowScene {
renderVals(){ return { ...this.common(), ...this.room() }; }
}
DC.mount(Component, {"accent": "#8ea6ff"});
