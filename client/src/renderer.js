import * as THREE from 'three';

// Every 3D stage in the game gets its renderer from here. The factory asks the
// browser for a WebGL2 context itself, walking a ladder of permissive attribute
// sets. `failIfMajorPerformanceCaveat` stays false so a machine with hardware
// acceleration switched off still receives the browser's software renderer
// (ANGLE WARP on Windows, SwiftShader where the browser allows it) instead of a
// dead canvas. WebGL2 is what three r163+ (and this game) use; browsers that
// expose any WebGL2 implementation — hardware or software — will draw the room.
//
// Context creation can also fail transiently while a GPU process restarts, so
// the factory never gives up: it keeps retrying on the same canvas and React
// Three Fiber mounts the scene the moment a context arrives. There is no 2D
// substitute anywhere — the game renders 3D or it waits and retries.

const ATTEMPTS = [
  { alpha: false, depth: true, stencil: true, antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false },
  { alpha: false, depth: true, stencil: true, antialias: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false },
  { alpha: false, depth: true, stencil: true, antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false },
  { alpha: false, depth: true, stencil: false, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
  { alpha: true, depth: true, stencil: true, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
];
const RETRY_MS = 1200;

const boots = new WeakMap();

function acquireContext(canvas) {
  for (const attributes of ATTEMPTS) {
    try {
      const context = canvas.getContext('webgl2', attributes);
      if (!context) continue;
      if (typeof context.isContextLost === 'function' && context.isContextLost()) continue;
      return { context, attributes };
    } catch {
      // A thrown request counts as "this set did not work"; try the next one.
    }
  }
  return null;
}

async function boot(canvas, defaultProps) {
  for (;;) {
    const acquired = acquireContext(canvas);
    if (acquired) {
      const renderer = new THREE.WebGLRenderer({
        ...defaultProps,
        canvas,
        context: acquired.context,
        depth: acquired.attributes.depth,
        stencil: acquired.attributes.stencil,
        alpha: acquired.attributes.alpha,
        antialias: acquired.attributes.antialias,
        powerPreference: acquired.attributes.powerPreference,
        failIfMajorPerformanceCaveat: false,
      });
      renderer.debug.checkShaderErrors = import.meta.env.DEV;
      return renderer;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
}

// React Three Fiber calls the `gl` factory on every configure pass; all callers
// share one boot promise so concurrent retries can never open more than one
// context on a canvas.
export function createRenderer(defaultProps) {
  const canvas = defaultProps.canvas;
  let pending = boots.get(canvas);
  if (!pending) {
    pending = boot(canvas, defaultProps);
    boots.set(canvas, pending);
  }
  return pending;
}
