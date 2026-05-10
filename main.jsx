// Main app — scroll-bound flip cards into final hero invitation.

const { useState, useEffect, useRef, useMemo } = React;

const THEMES = {
  comic: {
    name: "Comic",
    stageInk: "#1a0d2e",
    paper: "#fff6e8",
    cards: [
      { caption1: "POW!",     caption2: "ONE",     color: "#FFD60A", text: "#1a0d2e" },
      { caption1: "GIGGLE!",  caption2: "❀",       color: "#FF5A8C", text: "#fff6e8" },
      { caption1: "ZOOM!",    caption2: "WHEE",    color: "#2EC4B6", text: "#1a0d2e" },
      { caption1: "TWIRL!",   caption2: "✦✦",      color: "#4361EE", text: "#fff6e8" },
      { caption1: "BOOM!",    caption2: "OH!",     color: "#FF7B54", text: "#1a0d2e" },
      { caption1: "DREAM!",   caption2: "★",       color: "#9D4EDD", text: "#fff6e8" },
      { caption1: "WONDER!",  caption2: "WOW",     color: "#FFB627", text: "#1a0d2e" },
    ],
    final: "#FFE6D0",
    confetti: ["#FFD60A","#FF5A8C","#2EC4B6","#4361EE","#FF7B54","#9D4EDD","#FFB627"],
    titleColors: { accent: "#ffd60a", shadow1: "#1a0d2e", shadow2: "#ff5a8c" },
  },
  pastel: {
    name: "Pastel",
    stageInk: "#2b1f3a",
    paper: "#fff8f0",
    cards: [
      { caption1: "HI!",      caption2: "ONE",     color: "#FFD3BA", text: "#3b2b2b" },
      { caption1: "BLOOM!",   caption2: "❀",       color: "#FFC2D1", text: "#3b2b2b" },
      { caption1: "WHEE!",    caption2: "✿",       color: "#B5EAD7", text: "#3b2b2b" },
      { caption1: "DREAM!",   caption2: "✦",       color: "#C7CEEA", text: "#3b2b2b" },
      { caption1: "POP!",     caption2: "OH!",     color: "#FFE5A5", text: "#3b2b2b" },
      { caption1: "TWIRL!",   caption2: "★",       color: "#E2C2FF", text: "#3b2b2b" },
      { caption1: "WOW!",     caption2: "YAY",     color: "#A8DADC", text: "#3b2b2b" },
    ],
    final: "#FFF1DC",
    confetti: ["#FFD3BA","#FFC2D1","#B5EAD7","#C7CEEA","#FFE5A5","#E2C2FF","#A8DADC"],
    titleColors: { accent: "#ff8fab", shadow1: "#2b1f3a", shadow2: "#ffc2d1" },
  },
  bold: {
    name: "Bold",
    stageInk: "#0b0d12",
    paper: "#f3efe7",
    cards: [
      { caption1: "ONE!",     caption2: "★",       color: "#FF3B30", text: "#fff6e8" },
      { caption1: "BOOM!",    caption2: "✦",       color: "#0A84FF", text: "#fff6e8" },
      { caption1: "ZAP!",     caption2: "WOW",     color: "#FFD60A", text: "#0b0d12" },
      { caption1: "POW!",     caption2: "OH!",     color: "#30D158", text: "#0b0d12" },
      { caption1: "WHIRL!",   caption2: "❀",       color: "#BF5AF2", text: "#fff6e8" },
      { caption1: "SHINE!",   caption2: "✿",       color: "#FF9F0A", text: "#0b0d12" },
      { caption1: "WONDER!",  caption2: "★★",      color: "#FF2D55", text: "#fff6e8" },
    ],
    final: "#F3EFE7",
    confetti: ["#FF3B30","#0A84FF","#FFD60A","#30D158","#BF5AF2","#FF9F0A","#FF2D55"],
    titleColors: { accent: "#FFD60A", shadow1: "#0b0d12", shadow2: "#FF3B30" },
  },
};

// Map raw progress through a slight ease so flips feel snappier in the middle
function ease(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; }

// Photo loader — try a few common extensions so user can drop jpg/png/webp
// into photos/ without renaming. Falls back to a placeholder if none exist.
const PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG'];
function PhotoImg({ slot, fallback }) {
  const [extIdx, setExtIdx] = React.useState(0);
  const [missing, setMissing] = React.useState(false);
  React.useEffect(() => { setExtIdx(0); setMissing(false); }, [slot]);
  if (missing) {
    return <div className="photo-missing">{fallback}</div>;
  }
  return (
    <img
      className="photo-img"
      src={`photos/${slot}.${PHOTO_EXTS[extIdx]}`}
      alt=""
      draggable="false"
      onError={() => {
        if (extIdx + 1 < PHOTO_EXTS.length) setExtIdx(extIdx + 1);
        else setMissing(true);
      }}
    />
  );
}

// WebAudio-generated sounds — no external files required
const Sounds = (() => {
  let ctx = null;
  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const whoosh = () => {
    const ac = ensure(); if (!ac) return;
    const dur = 0.32;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    const now = ac.currentTime;
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(380, now + dur);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter); filter.connect(gain); gain.connect(ac.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
  };
  const chime = () => {
    const ac = ensure(); if (!ac) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
    const now = ac.currentTime;
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + i * 0.08;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + 1.5);
    });
    // Soft sparkle: brief high triangle blip
    const sparkle = ac.createOscillator();
    const sg = ac.createGain();
    sparkle.type = 'triangle';
    sparkle.frequency.setValueAtTime(2093, now); // C7
    sg.gain.setValueAtTime(0, now);
    sg.gain.linearRampToValueAtTime(0.06, now + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    sparkle.connect(sg); sg.connect(ac.destination);
    sparkle.start(now); sparkle.stop(now + 0.65);
  };
  return { ensure, whoosh, chime };
})();

function App() {
  const defaults = window.__TWEAKS;
  const [t, setTweak] = window.useTweaks ? window.useTweaks(defaults) : [defaults, () => {}];

  const theme = THEMES[t.theme] || THEMES.comic;
  // Card count is configurable — cycle the theme's base palette/captions for any N
  const baseCards = theme.cards;
  const cardCount = Math.max(1, Math.min(20, parseInt(t.cardCount, 10) || baseCards.length));
  const cards = useMemo(
    () => Array.from({length: cardCount}, (_, i) => baseCards[i % baseCards.length]),
    [cardCount, baseCards]
  );

  // Scale the scroll-track so each flip gets the same scroll distance regardless of N
  useEffect(() => {
    const track = document.getElementById('scroll-track');
    if (track) track.style.height = `${Math.round((cardCount / 7) * 700)}vh`;
  }, [cardCount]);

  const [progress, setProgress] = useState(0);
  const stageRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ink', theme.stageInk);
    root.style.setProperty('--paper', theme.paper);
    document.body.style.background = theme.stageInk;
  }, [theme]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const total = document.documentElement.scrollHeight - window.innerHeight;
        const p = total > 0 ? Math.max(0, Math.min(1, window.scrollY / total)) : 0;
        setProgress(p);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const FLIP_END = 0.72;
  const speed = t.flipSpeed || 1.0;
  // Effectively shrink flip region with higher speed -> flips happen sooner
  const adjFlipEnd = Math.max(0.35, FLIP_END / speed);
  const flipP = Math.min(progress / adjFlipEnd, 1);
  const activeFloat = flipP * cards.length; // 0..N
  const activeIdx = Math.min(Math.floor(activeFloat), cards.length);
  const tween = ease(activeFloat - activeIdx);

  // Final-state thresholds (relative to overall scroll, not flip region)
  const finalLockedAt = adjFlipEnd; // when last flip finishes
  const detailsP = Math.max(0, Math.min(1, (progress - (finalLockedAt + 0.04)) / 0.18));
  const titleP = Math.max(0, Math.min(1, (progress - (finalLockedAt + 0.01)) / 0.15));
  const confettiActive = progress > finalLockedAt - 0.02;

  // Hide scroll hint as soon as the first flip starts
  useEffect(() => {
    const el = document.getElementById('scroll-hint');
    if (!el) return;
    el.style.opacity = progress > 0.02 ? '0' : '1';
    el.style.transition = 'opacity 0.3s';
  }, [progress]);

  // Unlock audio context on first user gesture (browser autoplay policy)
  useEffect(() => {
    const unlock = () => Sounds.ensure();
    const opts = { passive: true };
    window.addEventListener('scroll', unlock, opts);
    window.addEventListener('touchstart', unlock, opts);
    window.addEventListener('click', unlock);
    return () => {
      window.removeEventListener('scroll', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);

  // Whoosh on each flip transition; chime once when entering final scene
  const prevIdxRef = useRef(0);
  const finalChimedRef = useRef(false);
  useEffect(() => {
    if (!t.enableSounds) { prevIdxRef.current = activeIdx; return; }
    if (activeIdx > prevIdxRef.current && activeIdx <= cards.length) {
      Sounds.whoosh();
    }
    if (activeIdx >= cards.length && !finalChimedRef.current) {
      Sounds.chime();
      finalChimedRef.current = true;
    }
    if (activeIdx < cards.length - 1) finalChimedRef.current = false;
    prevIdxRef.current = activeIdx;
  }, [activeIdx, t.enableSounds, cards.length]);

  // Background music — fades in as we approach the final scene
  const musicRef = useRef(null);
  useEffect(() => {
    if (!t.enableMusic || !t.musicUrl) {
      if (musicRef.current) { musicRef.current.pause(); musicRef.current = null; }
      return;
    }
    const audio = new Audio(t.musicUrl);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = 'auto';
    musicRef.current = audio;
    const tryPlay = () => { audio.play().catch(() => {}); };
    window.addEventListener('scroll', tryPlay, { once: true, passive: true });
    window.addEventListener('touchstart', tryPlay, { once: true, passive: true });
    window.addEventListener('click', tryPlay, { once: true });
    return () => {
      audio.pause();
      audio.src = '';
      musicRef.current = null;
      window.removeEventListener('scroll', tryPlay);
      window.removeEventListener('touchstart', tryPlay);
      window.removeEventListener('click', tryPlay);
    };
  }, [t.enableMusic, t.musicUrl]);
  useEffect(() => {
    if (!musicRef.current) return;
    const ramp = Math.max(0, Math.min(1, (progress - (finalLockedAt - 0.08)) / 0.20));
    musicRef.current.volume = ramp * 0.5;
  }, [progress, finalLockedAt]);

  // Build the map URL — use override if set, otherwise auto-derive from location text
  const mapsHref = (t.mapsUrl && t.mapsUrl.trim())
    ? t.mapsUrl.trim()
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.locationText || '')}`;

  // Flash overlay during mid-flip points (each card's mid-rotation)
  const flashOpacity = useMemo(() => {
    if (activeIdx >= cards.length) return 0;
    // peak when tween is around 0.5
    const peak = 1 - Math.abs(tween - 0.5) * 2; // 0..1..0
    return Math.max(0, peak * 0.35);
  }, [activeIdx, tween, cards.length]);

  return (
    <React.Fragment>
      <div className="card-stack" ref={stageRef}>
        {cards.map((c, i) => {
          // Card i is the active flipping one if i === activeIdx (and activeIdx < N)
          let rotY = 0, scale = 1, opacity = 1;
          if (i < activeIdx) {
            rotY = -180; opacity = 0;
          } else if (i === activeIdx && activeIdx < cards.length) {
            rotY = -180 * tween;
            // little scale pulse during flip
            scale = 1 + Math.sin(tween * Math.PI) * 0.04;
          } else {
            rotY = 0;
          }

          const z = cards.length + 5 - i; // earlier cards on top
          const showCaption = t.showCaptions !== false;

          return (
            <div
              key={i}
              className="flip-card"
              style={{
                background: c.color,
                color: c.text,
                zIndex: z,
                transform: `rotateY(${rotY}deg) scale(${scale})`,
                opacity,
                transition: 'opacity 0.05s linear',
              }}
            >
              <div className="panel-bg" />
              <div className="corner-burst" />
              <div className="frame-label">No. {String(i+1).padStart(2,'0')} / {String(cards.length+1).padStart(2,'0')}</div>
              <div className="photo-wrap">
                <PhotoImg slot={`photo-${i+1}`} fallback={`Photo ${i+1}`} />
              </div>
              {showCaption && (
                <React.Fragment>
                  <div className="caption tl">{c.caption1}</div>
                  <div className="caption br" style={{fontSize: 'clamp(36px, 6vw, 64px)'}}>{c.caption2}</div>
                </React.Fragment>
              )}
            </div>
          );
        })}

        {/* Final hero card — never flips */}
        <div
          className="flip-card final-card"
          style={{
            background: theme.final,
            color: theme.stageInk,
            zIndex: 1,
            transform: `rotateY(0deg) scale(${1 + Math.max(0, (progress - finalLockedAt) * 0.05)})`,
          }}
        >
          <div className="panel-bg" style={{opacity: 0.25}} />
          <div className="candle-glow" style={{ opacity: confettiActive ? 1 : 0, transition: 'opacity 0.6s' }} />
          <div className="frame-label" style={{borderColor: theme.stageInk, color: theme.stageInk, background: 'rgba(255,255,255,0.85)'}}>
            No. {String(cards.length+1).padStart(2,'0')} / {String(cards.length+1).padStart(2,'0')} · MAKE A WISH
          </div>
          <div className="photo-wrap" style={{height: '88%', width: '88%'}}>
            <PhotoImg slot="cake" fallback="Cake-blowing photo" />
          </div>
        </div>
      </div>

      {/* Mid-flip white flash for impact */}
      <div className="flash-overlay" style={{ opacity: flashOpacity }} />

      {/* Title appearing with final card */}
      <div className="hero-title" style={{
        opacity: titleP,
        transform: `translateX(-50%) translateY(${(1 - titleP) * -40}px)`,
        transition: 'opacity 0.05s linear',
      }}>
        <div className="small" style={{color: theme.titleColors.accent}}>{t.preTitle}</div>
        <div className="name" style={{
          textShadow: `4px 4px 0 ${theme.titleColors.shadow1}, 8px 8px 0 ${theme.titleColors.shadow2}`,
          color: theme.paper,
        }}>{t.childName} is {t.ageWord}</div>
      </div>

      {/* Details panel rising from bottom */}
      <div className="details-panel" style={{
        opacity: detailsP,
        transform: `translateX(-50%) translateY(${(1 - detailsP) * 60}px) rotate(${(1 - detailsP) * -2}deg)`,
        transition: 'opacity 0.05s linear',
        background: theme.paper,
        color: theme.stageInk,
        borderColor: theme.stageInk,
        boxShadow: `10px 10px 0 ${theme.stageInk}`,
      }}>
        <div className="item">
          <div className="lbl" style={{color: theme.titleColors.shadow2}}>When</div>
          <div className="val">{t.dateText}</div>
        </div>
        <div className="item">
          <div className="lbl" style={{color: theme.titleColors.shadow2}}>Time</div>
          <div className="val">{t.timeText}</div>
        </div>
        <div className="item">
          <div className="lbl" style={{color: theme.titleColors.shadow2}}>Where</div>
          <div className="val">
            <a className="loc-link" href={mapsHref} target="_blank" rel="noopener noreferrer" title="Open in Google Maps">
              {t.locationText}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
            </a>
          </div>
        </div>
        <div className="rsvp">
          <strong style={{color: theme.titleColors.accent === '#FFD60A' ? '#4361ee' : theme.titleColors.shadow2}}>RSVP</strong>
          <span>{t.rsvpText}</span>
        </div>
      </div>

      <Confetti
        active={confettiActive}
        density={t.confettiDensity || 4}
        palette={theme.confetti}
      />

      {/* Tweaks panel */}
      {window.TweaksPanel && (
        <window.TweaksPanel title="Invite Tweaks">
          <window.TweakSection title="Party details">
            <window.TweakText label="Child name" value={t.childName} onChange={(v) => setTweak('childName', v)} />
            <window.TweakText label="Age word" value={t.ageWord} onChange={(v) => setTweak('ageWord', v)} />
            <window.TweakText label="Pre-title" value={t.preTitle} onChange={(v) => setTweak('preTitle', v)} />
            <window.TweakText label="Date" value={t.dateText} onChange={(v) => setTweak('dateText', v)} />
            <window.TweakText label="Time" value={t.timeText} onChange={(v) => setTweak('timeText', v)} />
            <window.TweakText label="Location" value={t.locationText} onChange={(v) => setTweak('locationText', v)} />
            <window.TweakText label="Maps URL (optional)" value={t.mapsUrl} onChange={(v) => setTweak('mapsUrl', v)} />
            <window.TweakText label="RSVP" value={t.rsvpText} onChange={(v) => setTweak('rsvpText', v)} />
          </window.TweakSection>
          <window.TweakSection title="Look & feel">
            <window.TweakRadio
              label="Theme"
              value={t.theme}
              onChange={(v) => setTweak('theme', v)}
              options={[
                {value: 'comic', label: 'Comic'},
                {value: 'pastel', label: 'Pastel'},
                {value: 'bold', label: 'Bold'},
              ]}
            />
            <window.TweakToggle label="Show captions" value={t.showCaptions} onChange={(v) => setTweak('showCaptions', v)} />
            <window.TweakSlider label="Number of flip cards" min={1} max={20} step={1} value={t.cardCount} onChange={(v) => setTweak('cardCount', v)} />
            <window.TweakSlider label="Confetti density" min={1} max={10} step={1} value={t.confettiDensity} onChange={(v) => setTweak('confettiDensity', v)} />
            <window.TweakSlider label="Flip speed" min={0.6} max={2.0} step={0.1} value={t.flipSpeed} onChange={(v) => setTweak('flipSpeed', v)} />
          </window.TweakSection>
          <window.TweakSection title="Sound">
            <window.TweakToggle label="Whoosh + chime sound effects" value={t.enableSounds} onChange={(v) => setTweak('enableSounds', v)} />
            <window.TweakToggle label="Background music" value={t.enableMusic} onChange={(v) => setTweak('enableMusic', v)} />
            <window.TweakText label="Music file URL" value={t.musicUrl} onChange={(v) => setTweak('musicUrl', v)} />
          </window.TweakSection>
        </window.TweaksPanel>
      )}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
