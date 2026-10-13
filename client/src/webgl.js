// A machine with 3D graphics switched off (hardware acceleration disabled,
// remote desktop, blocked drivers) must still get the story. This probe is the
// single source of truth: when it fails, callers render the 2D storyboard stage
// instead of ever leaving a dead canvas on screen.
//
// Creating the canvas is the only reliable test. Several attribute sets are
// tried because some browsers refuse `high-performance` or non-software
// contexts while still being perfectly able to draw with softer settings.

let probe = null;

function canCreateContext() {
  if (typeof document === 'undefined') return false;
  const types = ['webgl2', 'webgl', 'experimental-webgl'];
  const attempts = [
    { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false },
    { powerPreference: 'default', failIfMajorPerformanceCaveat: false },
    { failIfMajorPerformanceCaveat: false, antialias: false, depth: true },
  ];
  for (const type of types) {
    for (const attributes of attempts) {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext(type, attributes);
        if (!gl) continue;
        if (typeof gl.isContextLost === 'function' && gl.isContextLost()) continue;
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return true;
      } catch {
        // A thrown context request counts as unsupported; try the next set.
      }
    }
  }
  return false;
}

export function webglSupported() {
  if (probe === null) probe = canCreateContext();
  return probe;
}

// The stage lets the player retry 3D after a context loss; a fresh probe can
// then succeed where the first one did not (e.g. the GPU process recovered).
export function resetWebglProbe() {
  probe = null;
}
