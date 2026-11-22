for (const catalog of document.querySelectorAll('[data-benchmark-carousel]')) {
    const strip = catalog.querySelector('.bench-scroll');
    const buttons = [...catalog.querySelectorAll('[data-benchmark-step]')];
    const [previous, next] = buttons;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    function updateControls() {
        previous.disabled = strip.scrollLeft <= 1;
        next.disabled = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 1;
    }

    for (const button of buttons) {
        button.addEventListener('click', () => {
            strip.scrollBy({
                left: Number(button.dataset.benchmarkStep) * strip.clientWidth * 0.86,
                behavior: reducedMotion.matches ? 'auto' : 'smooth',
            });
        });
    }
    strip.addEventListener('scroll', updateControls, { passive: true });
    new ResizeObserver(updateControls).observe(strip);
    updateControls();
}
