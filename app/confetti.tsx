"use client";

import {useEffect, useState, type CSSProperties} from 'react';

const colors = ['#f5c85d', '#88d9bb', '#b8b2f4', '#eda59d'];

/** One lightweight, decorative celebration per final-results mount. */
export function Confetti() {
    const [active, setActive] = useState(false);

    useEffect(() => {
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (motion.matches) return;
        setActive(true);
        const stop = () => { if (motion.matches) setActive(false); };
        motion.addEventListener('change', stop);
        const timeout = window.setTimeout(() => setActive(false), 6000);
        return () => {
            window.clearTimeout(timeout);
            motion.removeEventListener('change', stop);
        };
    }, []);

    if (!active) return null;
    return <div className="confetti" aria-hidden="true">
        {Array.from({length: 64}, (_, i) => <i key={i} style={{
            left: `${(i * 37) % 101}%`,
            backgroundColor: colors[i % colors.length],
            width: `${6 + i % 5}px`,
            height: `${8 + i % 7}px`,
            borderRadius: i % 3 === 0 ? '50%' : '2px',
            animationDelay: `${(i % 9) * 0.09}s`,
            animationDuration: `${3.4 + (i % 8) * 0.16}s`,
            '--drift': `${((i * 53) % 241) - 120}px`,
            '--spin': `${(i % 2 ? 1 : -1) * (360 + (i % 5) * 120)}deg`,
        } as CSSProperties} />)}
    </div>;
}
