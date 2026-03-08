/* ============================================================
   TravelSeek — Core JS  (travelseek-core.js)
   Shared across all pages.
   Requires: Lenis loaded before this file.
   ============================================================ */

(function () {
    'use strict';

    /* ── 1. Lenis smooth scroll ─────────────────────────────── */
    if (typeof Lenis === 'undefined') {
        console.warn('TravelSeek: Lenis not found. Load it before travelseek-core.js.');
        return;
    }

    const lenis = new Lenis({
        duration:        0.9,
        easing:          t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel:     true,
        smoothTouch:     false,
        wheelMultiplier: 1.1,
    });

    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);

    window.tsLenis = lenis; /* expose so any page script can call tsLenis.scrollTo() */


    /* ── 2. Parallax — runs on every Lenis scroll tick ─────── */
    /*  [data-parallax]  gallery images  ±52px  scale 1.14      */
    /*  [data-sp]        section images  ±28px  scale 1.08      */
    const galImgs = document.querySelectorAll('.ts-gal-img[data-parallax]');
    const secImgs = document.querySelectorAll('[data-sp]');

    if (galImgs.length || secImgs.length) {
        function shift(el, maxShift, baseScale) {
            const wrap = el.parentElement;
            if (!wrap) return;
            const rect = wrap.getBoundingClientRect();
            const wh   = window.innerHeight;
            if (rect.bottom < -120 || rect.top > wh + 120) return;
            const prog = ((rect.top + rect.height / 2) - wh / 2) / wh;
            el.style.transform = `scale(${baseScale}) translateY(${prog * maxShift}px)`;
        }

        lenis.on('scroll', () => {
            galImgs.forEach(img => {
                if (img.closest('.ts-gal-card')?.matches(':hover')) return;
                shift(img, 52, 1.14);
            });
            secImgs.forEach(img => shift(img, 28, 1.08));
        });
    }


    /* ── 3. Gallery card reveal (IntersectionObserver) ─────── */
    const galCards = document.querySelectorAll('.ts-gal-card[data-gal]');
    if (galCards.length) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('ts-gal-visible');
                io.unobserve(entry.target);
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });
        galCards.forEach(c => io.observe(c));
    }

    /* ── 4. Philosophy section — responsive scroll animation ─── */
    /*
     * TWO strategies, one per breakpoint:
     *
     * MOBILE (< 768px):
     *   Overlay hidden via CSS. The image card animates directly:
     *   clip-path curtain (bottom→top) + scale + opacity.
     *   IntersectionObserver on the small card element is reliable here.
     *   One-shot (no scroll-back needed on mobile).
     *
     * DESKTOP (≥ 768px):
     *   Full-section overlay (clip-path: image-card rect → inset(0%)).
     *   Triggered via Lenis scroll progress — immune to tall-section
     *   threshold problems that break IntersectionObserver.
     *   Bidirectional: restores on scroll-back with hysteresis.
     */
    const philSection = document.getElementById('ts-phil-section');
    const philOverlay = document.getElementById('ts-phil-overlay');
    const philImgWrap = document.getElementById('ts-phil-img-wrap');

    if (!philSection || !philImgWrap) return;

    const reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.innerWidth < 768;

    /* ── MOBILE path ─────────────────────────────────────────── */
    if (isMobile) {
        if (reduced) {
            philImgWrap.classList.add('ts-phil-card--revealed');
        } else {
            /* Observe #ts-phil-content (the grid), NOT the card itself.
             * The card starts at opacity:0 so its intersection area may be
             * reported as 0 by some browsers, preventing the observer firing.
             * The grid container is always visible and reliable to watch. */
            const philContent = document.getElementById('ts-phil-content');
            const target = philContent || philImgWrap;

            const cardIO = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    philImgWrap.classList.add('ts-phil-card--revealed');
                    cardIO.disconnect();
                });
            }, {
                threshold:  0.4,
                rootMargin: '0px 0px -10% 0px',
            });
            cardIO.observe(target);
        }
        return;
    }

    /* ── DESKTOP path ────────────────────────────────────────── */
    if (!philOverlay) return;

    function computeClip() {
        const sr = philSection.getBoundingClientRect();
        const wr = philImgWrap.getBoundingClientRect();
        const T = Math.max(0, (wr.top    - sr.top)    / sr.height * 100);
        const R = Math.max(0, (sr.right  - wr.right)  / sr.width  * 100);
        const B = Math.max(0, (sr.bottom - wr.bottom) / sr.height * 100);
        const L = Math.max(0, (wr.left   - sr.left)   / sr.width  * 100);
        return `inset(${T.toFixed(3)}% ${R.toFixed(3)}% ${B.toFixed(3)}% ${L.toFixed(3)}% round 1rem)`;
    }

    function setRevealed(on) {
        if (on) {
            philSection.classList.add('ts-phil--revealed');
            philOverlay.style.clipPath = 'inset(0% 0% 0% 0% round 0px)';
        } else {
            philSection.classList.remove('ts-phil--revealed');
            philOverlay.style.clipPath = computeClip();
        }
    }

    if (reduced) {
        philOverlay.style.clipPath = 'inset(0% round 0px)';
        setRevealed(true);
    } else {
        const REVEAL_AT  = 1;
        const RESTORE_AT = 0.90;
        let   revealed   = false;

        function onScroll() {
            const sr       = philSection.getBoundingClientRect();
            const vh       = window.innerHeight;
            const progress = (vh - sr.bottom) / (vh + sr.height) + 1;

            if (!revealed && progress >= REVEAL_AT) {
                revealed = true;
                setRevealed(true);
            } else if (revealed && progress < RESTORE_AT) {
                revealed = false;
                setRevealed(false);
            }
        }

        function initOverlay() {
            philOverlay.style.clipPath = computeClip();
            requestAnimationFrame(() => {
                philOverlay.classList.add('ts-phil-ready');
                window.addEventListener('resize', () => {
                    if (!revealed) philOverlay.style.clipPath = computeClip();
                }, { passive: true });
                lenis.on('scroll', onScroll);
                onScroll();
            });
        }

        requestAnimationFrame(() => requestAnimationFrame(initOverlay));
    }

})();