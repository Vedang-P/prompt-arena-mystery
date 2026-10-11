import HumanActor, { HUMAN_CAST } from './HumanActor.jsx';

// Every staged character is a bundled Rocketbox rig. An unknown id renders no
// body rather than suspending the whole room on a missing model, while its
// hotspot and label stay usable.
export default function Actor(props) {
  return HUMAN_CAST.has(props.character) ? <HumanActor {...props} /> : null;
}
