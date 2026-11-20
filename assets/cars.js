// Interactive parts of cars.html: the mirror ball in Music mode (runs on assets/dc-lite.js + assets/scene.js)
class Component extends GlowScene {
renderVals(){ return { ...this.common('/Glow is listening: louder spins faster, every beat throws a sparkle.'), ...this.ball() }; }
}
DC.mount(Component, {"accent": "#8ea6ff"});
