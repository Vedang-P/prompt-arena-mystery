export default function LogoutButton({ disabled = false, className = 'quiet-button' }) {
  const logout = () => {
    // Keep shared-device drafts out of the next team's session. Server saves stay intact.
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('arena-answer:') || key.startsWith('pa-intro-')) sessionStorage.removeItem(key);
      }
      localStorage.removeItem('moon-mode');
    } catch {}
    window.location.replace('/api/auth/logout');
  };
  return <button type="button" className={className} onClick={logout} disabled={disabled}>Log out</button>;
}
