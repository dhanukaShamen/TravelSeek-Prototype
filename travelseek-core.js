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

        /* Skip parallax on mobile — reduces jank and excessive image cropping.
         * Re-evaluated on resize so orientation changes are handled.            */
        let parallaxEnabled = window.innerWidth >= 768;
        window.addEventListener('resize', () => {
            parallaxEnabled = window.innerWidth >= 768;
        }, { passive: true });

        lenis.on('scroll', () => {
            if (!parallaxEnabled) return;
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

    if (reduced) {
        philOverlay.style.clipPath = 'inset(0% round 0px)';
        philSection.classList.add('ts-phil--revealed');
    } else {
        /*
         * SCROLL_START → SCROLL_END defines the progress window over which
         * the clip-path interpolates from card-rect percentages → 0%.
         *
         * progress formula:  (vh - section.bottom) / (vh + section.height) + 1
         *   ≈ 0  when section bottom enters viewport bottom
         *   ≈ 1  when section bottom reaches viewport top
         *
         * SCROLL_START (0.70): begin expanding
         * SCROLL_END   (0.95): fully open — 0.25 range = smooth travel window
         *
         * Scrim + content-fade are CSS transitions triggered by .ts-phil--revealed
         * which fires once the clip reaches 50% open.
         */
        const SCROLL_START = 0.86;
        const SCROLL_END   = 1.2;

        /* Starting inset % values — set once after first measurement */
        let startT, startR, startB, startL;
        let cssRevealFired   = false;
        let cssRestoreFired  = false;

        function lerp(a, b, t) { return a + (b - a) * t; }
        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

        function measureStart() {
            const sr = philSection.getBoundingClientRect();
            const wr = philImgWrap.getBoundingClientRect();
            startT = Math.max(0, (wr.top    - sr.top)    / sr.height * 100);
            startR = Math.max(0, (sr.right  - wr.right)  / sr.width  * 100);
            startB = Math.max(0, (sr.bottom - wr.bottom) / sr.height * 100);
            startL = Math.max(0, (wr.left   - sr.left)   / sr.width  * 100);
        }

        function onScroll() {
            const sr       = philSection.getBoundingClientRect();
            const vh       = window.innerHeight;
            const progress = (vh - sr.bottom) / (vh + sr.height) + 1;

            /* Normalise progress into 0→1 within our scroll window */
            const t = clamp((progress - SCROLL_START) / (SCROLL_END - SCROLL_START), 0, 1);

            /* Ease: smoothstep for organic feel */
            const ease = t * t * (3 - 2 * t);

            const T = lerp(startT, 0, ease);
            const R = lerp(startR, 0, ease);
            const B = lerp(startB, 0, ease);
            const L = lerp(startL, 0, ease);

            philOverlay.style.clipPath =
                `inset(${T.toFixed(3)}% ${R.toFixed(3)}% ${B.toFixed(3)}% ${L.toFixed(3)}% round ${lerp(16, 0, ease).toFixed(1)}px)`;

            /* Fire CSS class at 50% open for scrim + content fade */
            if (ease >= 0.5 && !cssRevealFired) {
                cssRevealFired  = true;
                cssRestoreFired = false;
                philSection.classList.add('ts-phil--revealed');
            } else if (ease < 0.5 && !cssRestoreFired) {
                cssRestoreFired = true;
                cssRevealFired  = false;
                philSection.classList.remove('ts-phil--revealed');
            }
        }

        function initOverlay() {
            measureStart();
            philOverlay.style.clipPath =
                `inset(${startT.toFixed(3)}% ${startR.toFixed(3)}% ${startB.toFixed(3)}% ${startL.toFixed(3)}% round 1rem)`;

            requestAnimationFrame(() => {
                philOverlay.classList.add('ts-phil-ready');

                window.addEventListener('resize', () => {
                    measureStart();
                    /* Re-sync clip to current scroll position immediately */
                    onScroll();
                }, { passive: true });

                lenis.on('scroll', onScroll);
                onScroll();
            });
        }

        requestAnimationFrame(() => requestAnimationFrame(initOverlay));
    }

})();