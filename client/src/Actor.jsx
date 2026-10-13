import HumanActor, { HUMAN_CAST } from './HumanActor.jsx';
import { AssetBoundary } from './WorldBoundary.jsx';

// Every staged character is a bundled Rocketbox rig. An unknown id renders no
// body rather than suspending the whole room on a missing model, while its
// hotspot and label stay usable. A corrupt GLB is isolated the same way.
export default function Actor(props) {
  return HUMAN_CAST.has(props.character) ? <AssetBoundary fallback={null}><HumanActor {...props} /></AssetBoundary> : null;
}
