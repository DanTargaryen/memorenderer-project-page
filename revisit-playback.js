(() => {
  for (const panel of document.querySelectorAll("[data-pace]")) {
    if (panel.dataset.mrPaceReady) continue;
    panel.dataset.mrPaceReady = "1";

    const spans = JSON.parse(panel.dataset.pace);
    const video = panel.querySelector("video");
    const badge = panel.querySelector(".playback-rate");
    if (!video || !badge) continue;
    let frameCallback = null;

    function update() {
      const span = spans.find(([end]) => video.currentTime < end) ?? spans.at(-1);
      const speed = Number((span[1] * video.playbackRate).toFixed(2));
      const label = `${speed}×`;
      if (badge.textContent !== label) badge.textContent = label;
      badge.hidden = video.paused || video.ended || speed === 1;
    }

    function onFrame() {
      frameCallback = null;
      if (video.paused || video.ended) return;
      update();
      startFrameTracking();
    }

    function startFrameTracking() {
      if (frameCallback === null && typeof video.requestVideoFrameCallback === "function") {
        frameCallback = video.requestVideoFrameCallback(onFrame);
      }
    }

    video.addEventListener("play", () => {
      update();
      startFrameTracking();
    });
    for (const event of ["seeking", "seeked", "timeupdate", "loadedmetadata", "ratechange"]) {
      video.addEventListener(event, update);
    }
    for (const event of ["pause", "ended"]) {
      video.addEventListener(event, () => {
        if (frameCallback !== null && typeof video.cancelVideoFrameCallback === "function") {
          video.cancelVideoFrameCallback(frameCallback);
        }
        frameCallback = null;
        update();
      });
    }
  }
})();
