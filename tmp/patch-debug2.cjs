const fs = require('fs');
const file = 'src/components/CityScene.tsx';
let s = fs.readFileSync(file, 'utf8');
const needle = `  const timeline = useRef<gsap.core.Timeline | null>(null);
  const focusKey = focus.key;`;
if (!s.includes(needle)) throw new Error('needle missing');
s = s.replace(needle, `  const timeline = useRef<gsap.core.Timeline | null>(null);
  const focusKey = focus.key;
  useEffect(() => {
    const debugWindow = window as unknown as {
      __cityCamera?: THREE.Camera;
      __cityControls?: OrbitControlsImpl | null;
    };
    debugWindow.__cityCamera = camera;
    debugWindow.__cityControls = controls.current;
  }, [camera, controlsReady]);`);
fs.writeFileSync(file, s);
console.log('ok');
