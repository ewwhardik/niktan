import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, RoundedBox } from '@react-three/drei';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Color, ExtrudeGeometry, Group, MathUtils, NeutralToneMapping, PMREMGenerator, Shape, type DirectionalLight } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { perfTier } from '../../lib/perf';
import type { StepKey } from '../visuals/StepVisual';
import { PhoneScreen } from './PhoneScreens';

export interface PhoneStep { k: StepKey; t: string; chips: { label: string; value: string }[] }

/** Accent per step: rim light on the titanium, screen tint and chip dots. */
export const ACCENT: Record<StepKey, string> = {
  face: '#ff453a',
  eye: '#64d2ff',
  vision: '#5e8bff',
  hearing: '#30d5c8',
  symptoms: '#bf5af2',
};

// Real proportions (about 71.5 × 147 × 8 mm), in scene units.
const W = 1.08;
const H = 2.22;
const D = 0.105;
const R = 0.165;
/** CSS pixels of the DOM screen; scaled onto the glass so it stays crisp at any size. */
const SCREEN_PX = { w: 390, h: 812 };
/** Screen width in scene units: a thin, even bezel all round, like current phones. */
const SCREEN_W = W - 0.07;
const SCREEN_SCALE = SCREEN_W / SCREEN_PX.w / 0.025;

/** Rounded rectangle extruded with a small chamfer: flat sides and crisp edges, not a pill-shaped case. */
function slab(w: number, h: number, r: number, depth: number, bevel: number) {
  const x = -w / 2 + bevel;
  const y = -h / 2 + bevel;
  const iw = w - bevel * 2;
  const ih = h - bevel * 2;
  const ir = Math.max(0.001, r - bevel);
  const shape = new Shape();
  shape.moveTo(x + ir, y);
  shape.lineTo(x + iw - ir, y);
  shape.quadraticCurveTo(x + iw, y, x + iw, y + ir);
  shape.lineTo(x + iw, y + ih - ir);
  shape.quadraticCurveTo(x + iw, y + ih, x + iw - ir, y + ih);
  shape.lineTo(x + ir, y + ih);
  shape.quadraticCurveTo(x, y + ih, x, y + ih - ir);
  shape.lineTo(x, y + ir);
  shape.quadraticCurveTo(x, y, x + ir, y);
  const geo = new ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 5, curveSegments: 32 });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.computeVertexNormals();
  return geo;
}

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Screen({ step, index, total }: { step: PhoneStep; index: number; total: number }) {
  const accent = ACCENT[step.k];
  return (
    <div style={{ width: SCREEN_PX.w, height: SCREEN_PX.h, borderRadius: 50, overflow: 'hidden', background: '#000', position: 'relative', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <motion.div style={{ position: 'absolute', inset: 0 }} animate={{ background: `radial-gradient(90% 60% at 50% 40%, ${accent}38 0%, #000 72%)` }} transition={{ duration: 0.7 }} />
      <div style={{ position: 'absolute', top: 16, left: '50%', width: 118, height: 34, marginLeft: -59, borderRadius: 99, background: '#000', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }} />
      <div style={{ position: 'absolute', top: 70, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'rgba(255,255,255,0.6)' }}>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.14em' }}>0{index + 1} / 0{total}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: accent }} />Live</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.k}
          style={{ position: 'absolute', inset: 0 }}
          initial={{ opacity: 0, x: 60, scale: 0.96, filter: 'blur(14px)' }}
          animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: -60, scale: 0.96, filter: 'blur(14px)' }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <PhoneScreen step={step.k} accent={accent} />
        </motion.div>
      </AnimatePresence>
      <div style={{ position: 'absolute', left: 30, right: 30, bottom: 44, display: 'flex', gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.16)', overflow: 'hidden' }}>
            <motion.span style={{ display: 'block', height: '100%', transformOrigin: 'left' }} initial={false} animate={{ scaleX: i <= index ? 1 : 0, backgroundColor: i === index ? accent : '#ffffff' }} transition={{ duration: 0.45 }} />
          </span>
        ))}
      </div>
      {/* Faint glass gloss. */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,0.10) 0%, transparent 32%, transparent 70%, rgba(255,255,255,0.04) 100%)', pointerEvents: 'none' }} />
    </div>
  );
}

function ChipCard({ label, value, accent, delay = 0.12 }: { label: string; value: string; accent: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.9, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -12, scale: 0.96, filter: 'blur(8px)', transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 240, damping: 22, delay }}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px 14px 14px', borderRadius: 20, whiteSpace: 'nowrap', background: 'linear-gradient(140deg, rgba(52,52,58,0.88), rgba(20,20,22,0.82))', boxShadow: '0 30px 60px -24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 12, background: `${accent}2e`, boxShadow: `inset 0 0 0 1px ${accent}66`, display: 'grid', placeItems: 'center' }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, background: accent, boxShadow: `0 0 12px ${accent}` }} />
      </span>
      <span style={{ lineHeight: 1.2 }}>
        <span style={{ display: 'block', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: '#fff' }}>{value}</span>
      </span>
    </motion.div>
  );
}

function Rig({ steps, active, animate, compact }: { steps: PhoneStep[]; active: number; animate: boolean; compact: boolean }) {
  const group = useRef<Group>(null);
  const rim = useRef<DirectionalLight>(null);
  const swing = useRef(0);
  const last = useRef(active);
  const accent = useMemo(() => new Color(ACCENT[steps[active]!.k]), [steps, active]);
  const frame = useMemo(() => ({ color: new Color('#6a6a70') }), []);
  useEffect(() => {
    if (last.current !== active) swing.current = (active > last.current ? 1 : -1) * 0.55;
    last.current = active;
  }, [active]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 4);
    // A quick swing on each step change, settling like a real object.
    swing.current = MathUtils.damp(swing.current, 0, 3.2, dt);
    const idle = animate ? Math.sin(t * 0.45) * (compact ? 0.14 : 0.05) : 0;
    const targetY = -0.3 + (animate && !compact ? state.pointer.x * 0.38 : 0) + idle + swing.current;
    const targetX = 0.08 + (animate && !compact ? -state.pointer.y * 0.2 : 0);
    g.rotation.y += (targetY - g.rotation.y) * k;
    g.rotation.x += (targetX - g.rotation.x) * k;
    g.rotation.z = animate ? Math.sin(t * 0.6) * 0.015 : 0;
    g.position.y = animate ? Math.sin(t * 0.9) * 0.05 : 0;
    if (rim.current) rim.current.color.lerp(accent, 1 - Math.exp(-dt * 3));
  });

  const step = steps[active]!;
  const body = useMemo(() => slab(W, H, R, D, 0.014), []);
  const frontGlass = useMemo(() => slab(W - 0.012, H - 0.012, R - 0.006, 0.004, 0.0015), []);
  const backGlass = useMemo(() => slab(W - 0.02, H - 0.02, R - 0.01, 0.004, 0.0015), []);
  useEffect(() => () => { body.dispose(); frontGlass.dispose(); backGlass.dispose(); }, [body, frontGlass, backGlass]);
  return (
    <>
      <directionalLight position={[2.4, 2.8, 3.2]} intensity={2.2} />
      <directionalLight ref={rim} position={[-2.8, 0.6, -1.4]} intensity={5} />
      <directionalLight position={[2.6, -1.2, -2]} intensity={1.6} color="#ffffff" />
      <ambientLight intensity={0.15} />
      <group ref={group}>
        {/* Titanium band: flat sides with a fine chamfer. */}
        <mesh geometry={body}>
          <meshPhysicalMaterial color={frame.color} metalness={1} roughness={0.3} clearcoat={0.5} clearcoatRoughness={0.3} envMapIntensity={1.5} />
        </mesh>
        {/* Frosted glass back with the camera plateau. */}
        <mesh geometry={backGlass} position={[0, 0, -D / 2 - 0.0015]}>
          <meshPhysicalMaterial color="#1b1b1e" metalness={0.2} roughness={0.55} clearcoat={1} clearcoatRoughness={0.4} />
        </mesh>
        <RoundedBox args={[0.42, 0.42, 0.026]} radius={0.09} smoothness={6} position={[-0.24, 0.8, -D / 2 - 0.014]}>
          <meshPhysicalMaterial color="#2a2a2e" metalness={0.6} roughness={0.3} clearcoat={1} />
        </RoundedBox>
        {/* Front cover glass: black under the screen, glossy on top. */}
        <mesh geometry={frontGlass} position={[0, 0, D / 2 + 0.0015]}>
          <meshPhysicalMaterial color="#020202" metalness={0} roughness={0.05} clearcoat={1} clearcoatRoughness={0.04} />
        </mesh>
        {/* Buttons. */}
        {[[-W / 2 - 0.006, 0.52, 0.16], [-W / 2 - 0.006, 0.3, 0.16], [W / 2 + 0.006, 0.4, 0.28]].map(([x, y, h], i) => (
          <RoundedBox key={i} args={[0.014, h!, 0.04]} radius={0.006} smoothness={4} position={[x!, y!, 0]}>
            <meshPhysicalMaterial color={frame.color} metalness={1} roughness={0.25} />
          </RoundedBox>
        ))}
        {/* The live screen, laid onto the glass in 3D. */}
        <Html transform position={[0, 0, D / 2 + 0.006]} scale={SCREEN_SCALE} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <Screen step={step} index={active} total={steps.length} />
        </Html>
      </group>
      <ContactShadows position={[0, -H / 2 - 0.16, 0]} opacity={0.65} scale={3.4} blur={2.8} far={1.4} resolution={256} color="#000000" />
    </>
  );
}

class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Real-time 3D phone (titanium, glass, studio reflections) with the live screen and floating chips. */
export default function Phone3D({ steps, active, compact = false, onFail, className = '' }: { steps: PhoneStep[]; active: number; compact?: boolean; onFail: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: '60% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Chips live in the page, not the canvas, so nothing clips them; they drift with the pointer for depth.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 80, damping: 18 });
  const sy = useSpring(my, { stiffness: 80, damping: 18 });
  const nearX = useTransform(sx, (v) => v * 22);
  const nearY = useTransform(sy, (v) => v * 14);
  const farX = useTransform(sx, (v) => v * 12);
  const farY = useTransform(sy, (v) => v * 8);
  const step = steps[active]!;
  const slots = compact
    ? [{ style: { right: '2%', top: '20%' }, x: nearX, y: nearY, scale: 0.8, origin: 'top right' }, { style: { left: '3%', bottom: '7%' }, x: farX, y: farY, scale: 0.8, origin: 'bottom left' }]
    : [{ style: { left: '60%', top: '27%' }, x: nearX, y: nearY, scale: 1, origin: 'top left' }, { style: { right: '60%', bottom: '19%' }, x: farX, y: farY, scale: 1, origin: 'bottom right' }];
  return (
    <div ref={host} className={`relative ${className}`}
      onPointerMove={(e) => {
        if (reduce || compact) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
        my.set(((e.clientY - r.top) / r.height) * 2 - 1);
      }}
      onPointerLeave={() => { mx.set(0); my.set(0); }}>
      <Canvas
        frameloop={!visible ? 'never' : reduce ? 'demand' : 'always'}
        dpr={perfTier === 'lite' ? 1 : [1, 2]}
        camera={{ position: [0, 0, compact ? 5.3 : 4.8], fov: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
        style={{ touchAction: 'pan-y' }}
        onCreated={({ gl }) => { if (!gl.getContext()) onFail(); }}
        aria-hidden
      >
        <StudioEnvironment />
        <Boundary onFail={onFail}>
          <Rig steps={steps} active={active} animate={!reduce} compact={compact} />
        </Boundary>
      </Canvas>
      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
        <AnimatePresence>
          {step.chips.slice(0, 2).map((c, i) => {
            const slot = slots[i]!;
            return (
              <motion.div key={`${step.k}-${i}`} className="absolute" style={{ ...slot.style, x: slot.x, y: slot.y }}>
                <motion.div style={{ scale: slot.scale, transformOrigin: slot.origin }} animate={reduce ? undefined : { y: [0, -7, 0] }} transition={{ duration: 4.6 + i, repeat: Infinity, ease: 'easeInOut' }}>
                  <ChipCard label={c.label} value={c.value} accent={ACCENT[step.k]} delay={0.1 + i * 0.08} />
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
