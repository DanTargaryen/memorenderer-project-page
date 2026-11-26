(() => {
  for (const article of document.querySelectorAll('.comparison[data-revisit-profiles]')) {
    const profiles = JSON.parse(article.dataset.revisitProfiles);
    const own = JSON.parse(article.dataset.revisitOurs);
    const options = article.querySelector('.revisit-options');
    const video = article.querySelector('video');
    const label = article.querySelector('.pair-labels b:last-child');
    const loading = article.querySelector('.comparison-loading');
    const cache = new Map();
    let revision = 0;

    function selectedMethod() {
      return options.querySelector('input:checked').value;
    }

    function seek(time) {
      if (video.readyState >= 1) {
        video.currentTime = Math.max(0, Math.min(time, video.duration - .01));
        delete video.dataset.seek;
      } else {
        video.dataset.seek = String(time);
        video.preload = 'metadata';
        video.load();
      }
    }
    async function ready(expected) {
      if (location.protocol === 'file:') return;
      const key = selectedMethod();
      let entry = cache.get(key);
      if (!entry) {
        entry = {};
        entry.promise = fetch(profiles[key].movie).then(response => {
          if (!response.ok) throw new Error('Video unavailable');
          return response.blob();
        }).then(blob => { entry.url = URL.createObjectURL(blob); return entry.url; })
          .catch(error => { cache.delete(key); throw error; });
        cache.set(key, entry);
      }
      const url = entry.url || await entry.promise;
      if (revision === expected && video.src !== url) video.src = url;
    }
    function snapshots(profile) {
      for (const role of ['ours', 'other']) {
        const row = article.querySelector('.snapshot-row.' + role);
        const method = role === 'ours' ? 'MemoRenderer (Ours)' : profile.label;
        row.querySelector('.snapshot-method').textContent = method;
        for (const [index, stage] of ['history', 'revisit'].entries()) {
          const src = role === 'ours' ? profile['ours_' + stage + '_image'] || own[stage] : profile[stage + '_image'];
          const anchor = row.querySelectorAll('a')[index];
          const image = anchor.querySelector('img');
          const text = stage[0].toUpperCase() + stage.slice(1) + ' view of ' + article.dataset.subject + ' from ' + method;
          anchor.href = src;
          anchor.setAttribute('aria-label', 'Open ' + text);
          image.src = src;
          image.alt = text;
        }
      }
    }
    options.addEventListener('change', async () => {
      const key = selectedMethod();
      const profile = profiles[key];
      if (profile.available === false) return;
      const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const expected = ++revision;
      video.pause();
      video.poster = profile.poster;
      video.src = cache.get(key)?.url || profile.movie;
      label.textContent = profile.label;
      snapshots(profile);
      video.setAttribute('aria-label', article.dataset.case + ' synchronized comparison with ' + profile.label);
      loading.textContent = 'Loading comparison…';
      loading.hidden = false;
      try {
        await ready(expected);
        if (revision === expected) seek(time);
      } catch (error) {
        console.error('Revisit comparison:', article.dataset.case, error);
      } finally {
        if (revision === expected) loading.hidden = true;
      }
    });
    for (const button of article.querySelectorAll('.play-controls button')) {
      button.onclick = async () => {
        const expected = revision;
        const play = button.classList.contains('play-trajectory');
        const time = play ? 0 : Number(button.dataset.seconds);
        const title = button.textContent;
        video.pause();
        button.disabled = true;
        button.textContent = 'Loading…';
        try {
          await ready(expected);
          if (revision !== expected || !article.getClientRects().length) return;
          seek(time);
          if (play) await video.play();
        } catch (error) {
          console.error('Revisit comparison:', article.dataset.case, error);
        } finally {
          button.disabled = false;
          button.textContent = title;
        }
      };
    }
  }
  function setupStrip(article, video, timeline) {
    const play = article.querySelector('.strip-play-button');
    const label = play.querySelector('.strip-play-label');
    const playLabel = label.textContent;
    const range = timeline.querySelector('input');
    const clock = timeline.querySelector('span');
    const failure = article.querySelector('.strip-playback-error');
    let pendingSeek;

    const format = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
    function refresh() {
      if (Number.isFinite(video.duration)) {
        range.disabled = !!video.error;
        range.max = video.duration;
        range.value = video.currentTime;
        clock.textContent = `${format(video.currentTime)} / ${format(video.duration)}`;
      }
      const playing = !video.paused && !video.ended;
      play.dataset.playing = String(playing);
      label.textContent = playing ? 'Pause' : playLabel;
    }

    function toggle(fromStart) {
      if (!video.paused && !video.ended) {
        video.pause();
        return;
      }
      pendingSeek = undefined;
      failure.hidden = true;
      if (video.error) video.load();
      if (video.readyState && (fromStart || video.ended)) video.currentTime = 0;
      clock.textContent = 'Loading…';
      video.play().catch(error => {
        if (error.name !== 'AbortError') failure.hidden = false;
        if (!video.readyState) clock.textContent = '0:00';
        refresh();
      });
    }

    play.addEventListener('click', () => toggle(true));
    video.addEventListener('click', () => toggle(false));
    video.addEventListener('error', () => {
      failure.hidden = false;
      clock.textContent = '0:00';
      refresh();
    });
    range.addEventListener('input', () => { video.currentTime = range.valueAsNumber; });
    for (const button of article.querySelectorAll('.play-controls button[data-seconds]')) {
      button.addEventListener('click', () => {
        video.pause();
        const time = Number(button.dataset.seconds);
        if (video.readyState) video.currentTime = time;
        else pendingSeek = time;
      });
    }
    video.addEventListener('loadedmetadata', () => {
      if (pendingSeek !== undefined) {
        video.currentTime = pendingSeek;
        pendingSeek = undefined;
      }
      refresh();
    });
    for (const event of ['timeupdate', 'seeking', 'playing', 'play', 'pause', 'ended']) {
      video.addEventListener(event, refresh);
    }
    video.controls = false;
    timeline.hidden = false;
    refresh();
  }

  for (const article of document.querySelectorAll('[data-revisit-fixed]')) {
    const video = article.querySelector('video');
    const timeline = article.querySelector('.strip-timeline');
    if (timeline) {
      setupStrip(article, video, timeline);
      continue;
    }

    const source = video.getAttribute('src');
    let action = 0;
    let pending;
    video.addEventListener('loadedmetadata', () => {
      if (video.dataset.seek !== undefined) {
        video.currentTime = Math.max(0, Math.min(Number(video.dataset.seek), video.duration - .01));
        delete video.dataset.seek;
      }
    });
    for (const button of article.querySelectorAll('.play-controls button')) {
      button.onclick = async () => {
        const expected = ++action;
        const play = button.classList.contains('play-trajectory');
        const time = play ? 0 : Number(button.dataset.seconds);
        const title = button.textContent;
        video.pause();
        button.disabled = true;
        button.textContent = 'Loading…';
        try {
          if (location.protocol !== 'file:') {
            if (!pending) pending = fetch(source).then(response => {
              if (!response.ok) throw new Error('Video unavailable');
              return response.blob();
            }).then(blob => URL.createObjectURL(blob)).catch(error => { pending = undefined; throw error; });
            const url = await pending;
            if (expected !== action || !article.getClientRects().length) return;
            if (video.src !== url) video.src = url;
          }
          if (!article.getClientRects().length) return;
          if (video.readyState >= 1) video.currentTime = Math.max(0, Math.min(time, video.duration - .01));
          else { video.dataset.seek = String(time); video.preload = 'metadata'; video.load(); }
          if (play) await video.play();
        } catch (error) { console.error('Revisit playback:', article.dataset.case, error); }
        finally {
          button.disabled = false;
          button.textContent = title;
        }
      };
    }
  }
  const requested = new URLSearchParams(location.search).get('case');
  const radio = [...document.querySelectorAll('input[name="mr-case"]')].find(input => input.value === requested);
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change', {bubbles: true}));
    document.getElementById('revisit-comparisons')?.scrollIntoView({block: 'start'});
  }
})();
