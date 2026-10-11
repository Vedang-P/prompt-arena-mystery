import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, ExtrudeGeometry, Path, Shape, TubeGeometry, Vector3 } from 'three';

function tube(points, radius, segments = 28) {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
  return new TubeGeometry(curve, segments, radius, 8, false);
}

function ellipse(pointsCenter, rx, ry, z, radius) {
  const [x, y] = pointsCenter;
  return tube(Array.from({ length: 33 }, (_, i) => {
    const a = i / 32 * Math.PI * 2;
    return [x + Math.cos(a) * rx, y + Math.sin(a) * ry, z];
  }), radius, 48);
}

function createMaskGeometry() {
  const face = new Shape();
  face.moveTo(-.16, .105);
  face.bezierCurveTo(-.145, .19, -.06, .22, 0, .205);
  face.bezierCurveTo(.06, .22, .145, .19, .16, .105);
  face.bezierCurveTo(.17, .015, .125, -.105, .055, -.165);
  face.lineTo(0, -.19);
  face.lineTo(-.055, -.165);
  face.bezierCurveTo(-.125, -.105, -.17, .015, -.16, .105);
  for (const x of [-.075, .075]) {
    const eye = new Path();
    eye.absellipse(x, .065, .045, .023, 0, Math.PI * 2, false, 0);
    face.holes.push(eye);
  }
  const plate = new ExtrudeGeometry(face, {
    depth: .045,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: .012,
    bevelThickness: .012,
    curveSegments: 16,
  });
  plate.computeVertexNormals();

  const outline = tube([
    [-.16,.105,.035],[-.14,.18,.035],[-.06,.22,.035],[0,.205,.035],
    [.06,.22,.035],[.14,.18,.035],[.16,.105,.035],[.17,.015,.035],
    [.125,-.105,.035],[.055,-.165,.035],[0,-.19,.035],[-.055,-.165,.035],
    [-.125,-.105,.035],[-.17,.015,.035],[-.16,.105,.035],
  ], .008, 90);
  const eyeRims = [-.075,.075].map((x) => ellipse([x,.065],.048,.026,.048,.006));
  const horns = [
    tube([[-.115,.145,.005],[-.17,.205,0],[-.205,.285,-.005],[-.255,.33,0],[-.3,.31,.005]],.018,40),
    tube([[-.18,.22,0],[-.25,.235,0],[-.28,.265,0]],.011,20),
    tube([[.115,.145,.005],[.17,.205,0],[.205,.285,-.005],[.255,.33,0],[.3,.31,.005]],.018,40),
    tube([[.18,.22,0],[.25,.235,0],[.28,.265,0]],.011,20),
  ];
  const goldwork = [
    tube([[-.105,.145,.05],[-.055,.17,.052],[0,.15,.052],[.055,.17,.052],[.105,.145,.05]],.006,36),
    tube([[-.045,-.025,.052],[0,-.06,.056],[.045,-.025,.052]],.007,20),
  ];
  const lace = [
    tube([[-.13,.16,.018],[-.2,.19,.02],[-.16,.11,.02],[-.23,.075,.02],[-.18,.035,.02],[-.115,.1,.02]],.009,42),
    tube([[.13,.16,.018],[.2,.19,.02],[.16,.11,.02],[.23,.075,.02],[.18,.035,.02],[.115,.1,.02]],.009,42),
    tube([[-.1,.12,.055],[-.05,.105,.057],[0,.125,.058],[.05,.105,.057],[.1,.12,.055]],.005,30),
  ];
  return { plate, outline, eyeRims, horns, goldwork, lace };
}

export default function DemonMask({ position, rotation = [0,0,0], scale = 1 }) {
  const geometry = useMemo(createMaskGeometry, []);
  useEffect(() => () => {
    geometry.plate.dispose();
    geometry.outline.dispose();
    for (const item of [...geometry.eyeRims,...geometry.horns,...geometry.goldwork,...geometry.lace]) item.dispose();
  }, [geometry]);

  return <group position={position} rotation={rotation} scale={scale}>
    <mesh geometry={geometry.plate} castShadow receiveShadow>
      <meshStandardMaterial color="#d7c49a" roughness={.72} metalness={.08} />
    </mesh>
    <mesh geometry={geometry.outline} castShadow><meshStandardMaterial color="#9b7136" metalness={.68} roughness={.36} /></mesh>
    {geometry.eyeRims.map((g,i)=><mesh key={`eye-${i}`} geometry={g}><meshStandardMaterial color="#b28c4e" metalness={.62} roughness={.4}/></mesh>)}
    {geometry.horns.map((g,i)=><mesh key={`horn-${i}`} geometry={g} castShadow><meshStandardMaterial color="#b6a176" roughness={.68}/></mesh>)}
    {geometry.goldwork.map((g,i)=><mesh key={`gold-${i}`} geometry={g}><meshStandardMaterial color="#d1a953" metalness={.72} roughness={.32}/></mesh>)}
    {geometry.lace.map((g,i)=><mesh key={`lace-${i}`} geometry={g} castShadow><meshStandardMaterial color="#74383e" roughness={.8}/></mesh>)}
    <mesh position={[0,.145,.066]} castShadow><octahedronGeometry args={[.025,1]}/><meshStandardMaterial color="#a23b3b" metalness={.5} roughness={.28}/></mesh>
    {[-.105,.105].map((x,i)=><mesh key={`stud-${i}`} position={[x,.15,.058]}><sphereGeometry args={[.012,10,8]}/><meshStandardMaterial color="#dfbd71" metalness={.75} roughness={.3}/></mesh>)}
  </group>;
}
