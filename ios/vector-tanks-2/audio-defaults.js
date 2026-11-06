// Load the audio pack next to the game before enabling the shared engine.
codepenAudioBytes = fetch("./audio.pack")
  .then(response => {
    if (!response.ok) throw new Error("Sound bundle unavailable: " + response.status);
    return response.arrayBuffer();
  });

// Enable sound by default; browsers may wait for a user gesture to play it.
// The existing sound button still controls muting and retrying failed loads.
firstControlGesture = false;
// Native initialization starts the player engines, then clears inGame for
// attract mode without stopping those sources. Discard that startup intent
// before loading can restore it. New demo/game sessions start their own sounds.
audio.stopAll();
audio.enableFromGesture();

for (const event of ['pointerdown', 'pointerup', 'keydown']) {
  document.addEventListener(event, e => {
    if (soundToggle.contains(e.target)) return;
    const { enabled, status } = audio.state();
    // A blocked initial resume stays pending while the assets are loading.
    // The game's existing handler already resumes the paused state.
    if (enabled && status === 'loading') audio.resumeFromGesture();
  }, { capture: true });
}
