// Confetti — canvas-based, dynamic spawn while `active` is true.
// Pieces fall with gravity, rotate, and recycle off-screen.

function Confetti({ active, density = 4, palette }) {
  const piecesRef = React.useRef([]);
  const activeRef = React.useRef(active);
  const densityRef = React.useRef(density);
  const paletteRef = React.useRef(palette);

  React.useEffect(() => { activeRef.current = active; }, [active]);
  React.useEffect(() => { densityRef.current = density; }, [density]);
  React.useEffect(() => { paletteRef.current = palette; }, [palette]);

  React.useEffect(() => {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const stage = canvas.parentElement;
      const rect = stage.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let running = true;

    const spawn = () => {
      const w = canvas.width / dpr;
      const cols = paletteRef.current || ['#FFD60A', '#FF5A8C', '#2EC4B6', '#4361EE', '#FF7B54', '#9D4EDD', '#FFB627'];
      const count = Math.round(densityRef.current);
      for (let i = 0; i < count; i++) {
        const fromSide = Math.random() < 0.35;
        piecesRef.current.push({
          x: fromSide
            ? (Math.random() < 0.5 ? -10 : w + 10)
            : Math.random() * w,
          y: fromSide ? Math.random() * 80 + 20 : -20,
          vx: fromSide
            ? (Math.random() * 2 + 1.5) * (Math.random() < 0.5 ? 1 : -1)
            : (Math.random() - 0.5) * 3,
          vy: 1.5 + Math.random() * 3.5,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.25,
          size: 6 + Math.random() * 10,
          aspect: 0.4 + Math.random() * 0.5,
          color: cols[Math.floor(Math.random() * cols.length)],
          shape: Math.random() < 0.55 ? 'rect' : (Math.random() < 0.5 ? 'circle' : 'tri'),
          flutter: Math.random() * Math.PI * 2,
          flutterSp: 0.05 + Math.random() * 0.08,
        });
      }
    };

    const tick = () => {
      if (!running) return;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);

      if (activeRef.current && piecesRef.current.length < 360) {
        spawn();
      }

      const next = [];
      for (const p of piecesRef.current) {
        p.x += p.vx + Math.sin(p.flutter) * 0.6;
        p.y += p.vy;
        p.vy += 0.045;
        p.vx *= 0.998;
        p.rot += p.vrot;
        p.flutter += p.flutterSp;
        if (p.y > h + 40) continue;
        if (p.x < -40 || p.x > w + 40) continue;
        next.push(p);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size * p.aspect / 2, p.size, p.size * p.aspect);
        } else if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // small triangle / streamer
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      piecesRef.current = next;

      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return null; // canvas is in HTML; we just drive it
}

window.Confetti = Confetti;
