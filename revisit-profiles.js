(() => {
  for (const article of document.querySelectorAll('.comparison[data-revisit-profiles]')) {
    const profiles = JSON.parse(article.dataset.revisitProfiles);
    const own = JSON.parse(article.dataset.revisitOurs);
    const select = article.querySelector('select');
    const video = article.querySelector('video');
    const label = article.querySelector('.pair-labels b:last-child');
    const setup = article.querySelector('.protocol p');
    const loading = article.querySelector('.comparison-loading');
    const cache = new Map();
    let revision = 0;

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
      const key = select.value;
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
    select.addEventListener('change', async () => {
      const profile = profiles[select.value];
      if (profile.available === false) return;
      const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const expected = ++revision;
      video.pause();
      video.poster = profile.poster;
      video.src = cache.get(select.value)?.url || profile.movie;
      label.textContent = profile.label;
      setup.textContent = profile.setup;
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
          if (revision !== expected) return;
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
  for (const article of document.querySelectorAll('.comparison[data-revisit-fixed]')) {
    const video = article.querySelector('video');
    const source = video.getAttribute('src');
    let pending;
    video.addEventListener('loadedmetadata', () => {
      if (video.dataset.seek !== undefined) {
        video.currentTime = Math.max(0, Math.min(Number(video.dataset.seek), video.duration - .01));
        delete video.dataset.seek;
      }
    });
    for (const button of article.querySelectorAll('.play-controls button')) {
      button.onclick = async () => {
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
            if (video.src !== url) video.src = url;
          }
          if (video.readyState >= 1) video.currentTime = Math.max(0, Math.min(time, video.duration - .01));
          else { video.dataset.seek = String(time); video.preload = 'metadata'; video.load(); }
          if (play) await video.play();
        } catch (error) { console.error('Revisit comparison:', article.dataset.case, error); }
        finally { button.disabled = false; button.textContent = title; }
      };
    }
  }
  const requested = new URLSearchParams(location.search).get('case');
  const radio = [...document.querySelectorAll('input[name="mr-case"]')].find(input => input.value === requested);
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change', {bubbles: true}));
    document.getElementById('revisits')?.scrollIntoView({block: 'start'});
  }
})();
