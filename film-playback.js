(() => {
    const video = document.querySelector('#film video');
    if (!video?.dataset.hls) return;

    const playlist = new URL(video.dataset.hls, document.baseURI).href;
    const fallback = video.src;

    function useFallback(hls) {
        const time = video.currentTime;
        const resume = !video.paused;
        hls?.destroy();
        video.addEventListener('loadedmetadata', () => {
            if (time > 0) video.currentTime = Math.min(time, video.duration - 0.01);
            if (resume) video.play().catch(() => {});
        }, { once: true });
        video.src = fallback;
    }

    function attach() {
        if (window.Hls?.isSupported()) {
            const hls = new window.Hls({ maxBufferLength: 20, backBufferLength: 12 });
            hls.on(window.Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) useFallback(hls);
            });
            hls.attachMedia(video);
            hls.loadSource(playlist);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.addEventListener('error', () => useFallback(), { once: true });
            video.src = playlist;
        }
    }

    const library = document.createElement('script');
    library.src = '__assets/hls.min.js';
    library.onload = attach;
    document.head.append(library);
})();

(() => {
    function seek(video, seconds) {
        if (video.readyState) {
            video.pause();
            video.currentTime = seconds;
        } else {
            video.addEventListener('loadedmetadata', () => {
                video.currentTime = seconds;
            }, { once: true });
        }
    }

    // The hosted asset gateway serves progressive MP4s as whole responses.
    // A Blob gives the browser a seekable source after that single download.
    for (const comparison of document.querySelectorAll('.comparison')) {
        const video = comparison.querySelector('video');
        const controls = comparison.querySelector('.play-controls');
        const status = document.createElement('span');
        status.className = 'seek-status';
        status.setAttribute('role', 'status');
        status.hidden = true;
        controls.append(status);
        const state = { target: 0, inflight: false, source: video.src, blob: null };

        for (const button of controls.querySelectorAll('button[data-seconds]')) {
            button.onclick = async () => {
                state.target = Number(button.dataset.seconds);
                video.pause();
                if (state.blob) {
                    seek(video, state.target);
                    return;
                }
                if (state.inflight) return;
                state.inflight = true;
                status.hidden = false;
                status.textContent = 'Loading comparison…';
                try {
                    const result = await fetch(state.source);
                    if (!result.ok) throw new Error('Video unavailable');
                    state.blob = URL.createObjectURL(await result.blob());
                    video.addEventListener('loadedmetadata', () => {
                        seek(video, state.target);
                        status.hidden = true;
                    }, { once: true });
                    video.src = state.blob;
                } catch {
                    status.textContent = 'Could not load the comparison. Try again.';
                } finally {
                    state.inflight = false;
                }
            };
        }
    }
})();
