import { Component } from 'react';
import { Html } from '@react-three/drei';
export function SceneLoading() {
  return <Html center><div className="world-loading"><span className="loading-moon" /><p>Opening the scene</p></div></Html>;
}
export class WorldBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('scene_error', error.message); }
  render() {
    if (this.state.failed) return <div className="world-fallback"><p>The scene could not load.</p><p>Your case is saved. You can still use Explore to inspect the room.</p><button className="btn ghost" onClick={() => this.setState({ failed: false })}>Reload scene</button></div>;
    return this.props.children;
  }
}
