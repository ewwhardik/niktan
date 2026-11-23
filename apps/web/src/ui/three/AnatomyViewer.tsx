import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Color, Group, Mesh, MeshPhysicalMaterial, PMREMGenerator, type Material, type MeshStandardMaterial } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { perfTier } from '../../lib/perf';

export type Model = 'body' | 'heart';
export type CalloutTone = 'normal' | 'check' | 'none' | 'alert';

export interface Callout {
  id: string;
  label: string;
  value?: string;
  tone: CalloutTone;
  /** Anchor in the model's normalised frame (height 2, centred). */
  at: [number, number, number];
  side: 'left' | 'right';
}

const TONE: Record<CalloutTone, string> = {
  normal: 'var(--routine)',
  check: 'var(--seetoday)',
  alert: 'var(--emergency)',
  none: 'currentColor',
};

/** Medical-illustration callout: label, hairline leader and a hollow ring on the anatomy. */
function CalloutPin({ c, dark }: { c: Callout; dark: boolean }) {
  const left = c.side === 'left';
  return (
    <Html position={c.at} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`flex items-center ${dark ? 'text-white' : 'text-[#1d1d1f]'}`} style={{ transform: `translateX(${left ? '-50%' : '50%'})` }}>
        <div className={`flex items-center ${left ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className={`whitespace-nowrap ${left ? 'text-right' : 'text-left'}`}>
            <p className="text-[13px] leading-tight font-medium opacity-80">{c.label}</p>
            {c.value && <p className="tnum text-[13px] leading-tight font-semibold">{c.value}</p>}
          </div>
          <span className="mx-2 h-px w-12 sm:w-20" style={{ background: 'currentColor', opacity: 0.45 }} />
          <span className="size-2.5 rounded-full border-[1.5px] bg-transparent" style={{ borderColor: c.tone === 'none' ? 'currentColor' : TONE[c.tone], boxShadow: c.tone === 'none' ? undefined : `0 0 0 3px color-mix(in srgb, ${TONE[c.tone]} 25%, transparent)` }} />
        </div>
      </div>
    </Html>
  );
}

/** Lub-dub envelope (0..1) for a given time and heart rate. */
function beat(t: number, bpm: number) {
  const period = 60 / bpm;
  const p = (t % period) / period;
  return Math.exp(-((p - 0.05) ** 2) / 0.001) + 0.55 * Math.exp(-((p - 0.2) ** 2) / 0.0014);
}

const ARTERY = /aort|arter|pulmonary.?trunk|coronary|ventric/i;
const VEIN = /vena|vein|venous|atri/i;

/**
 * Physical materials that read like a medical illustration: glossy red muscle and arteries, blue
 * veins. Models that ship their own colours or textures keep them and only gain clearcoat.
 */
function anatomyMaterial(model: Model, mesh: Mesh): Material {
  const original = mesh.material as MeshStandardMaterial;
  const vertexColours = !!mesh.geometry.getAttribute('color');
  const hasOwnColour = !!original?.map || vertexColours;
  const name = `${mesh.name} ${original?.name ?? ''}`;
  const colour = model === 'heart' ? (VEIN.test(name) ? '#2f5fa8' : ARTERY.test(name) ? '#c62a2a' : '#b23a30') : '#a8382e';
  return new MeshPhysicalMaterial({
    color: hasOwnColour ? (original?.color ?? new Color('#ffffff')) : new Color(colour),
    map: original?.map ?? null,
    normalMap: original?.normalMap ?? null,
    vertexColors: vertexColours,
    roughness: model === 'heart' ? 0.38 : 0.55,
    metalness: 0,
    clearcoat: model === 'heart' ? 0.7 : 0.35,
    clearcoatRoughness: 0.25,
    sheen: 0.4,
    sheenColor: new Color('#ff9a8a'),
    sheenRoughness: 0.6,
  });
}

/** Soft studio lighting without downloading an HDR file. */
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

function GlbModel({ model, bpm, sway }: { model: Model; bpm?: number | null; sway: boolean }) {
  const { scene } = useGLTF(`/models/${model}.glb`);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.material = anatomyMaterial(model, m);
    });
    return clone;
  }, [scene, model]);
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!group.current) return;
    if (sway) group.current.rotation.y = Math.sin(t * 0.3) * 0.35;
    group.current.scale.setScalar(model === 'heart' && bpm ? 1 + 0.035 * beat(t, bpm) : 1);
  });
  return (
    <group ref={group}>
      <primitive object={object} />
    </group>
  );
}

class ModelBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
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

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface AnatomyViewerProps {
  model: Model;
  callouts?: Callout[];
  bpm?: number | null;
  interactive?: boolean;
  /** Light callout text for dark cards. */
  dark?: boolean;
  className?: string;
  /** Camera distance; smaller = closer. */
  zoom?: number;
  /** Shown when WebGL or the model file is unavailable. */
  fallback?: ReactNode;
}

export default function AnatomyViewer({ model, callouts = [], bpm, interactive = true, dark = false, className = '', zoom, fallback = null }: AnatomyViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [gl] = useState(webglAvailable);
  const [failed, setFailed] = useState(false);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Rendering stops entirely while the viewer is scrolled offscreen.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!gl || failed) return <div className={className}>{fallback}</div>;
  const distance = zoom ?? (model === 'body' ? 4.3 : 3.7);

  return (
    <div ref={host} className={`relative ${className}`}>
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={perfTier === 'lite' ? 1 : [1, 2]}
        camera={{ position: [0, model === 'body' ? 0.1 : 0, distance], fov: 35 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        aria-label={model === 'body' ? 'Body map' : 'Heart'}
      >
        <StudioEnvironment />
        <ambientLight intensity={0.35} />
        <directionalLight position={[2.5, 3, 3]} intensity={1.6} />
        <directionalLight position={[-3, 1, -2]} intensity={1.1} color="#9cc4ff" />
        <ModelBoundary onFail={() => setFailed(true)}>
          <Suspense fallback={null}>
            <GlbModel model={model} bpm={bpm} sway={!reduce} />
          </Suspense>
        </ModelBoundary>
        <ContactShadows position={[0, -1.02, 0]} opacity={dark ? 0.6 : 0.35} scale={4} blur={2.6} far={2} resolution={256} />
        {callouts.map((c) => (
          <CalloutPin key={c.id} c={c} dark={dark} />
        ))}
        {interactive && <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.6} maxPolarAngle={Math.PI / 1.7} minAzimuthAngle={-Math.PI / 3} maxAzimuthAngle={Math.PI / 3} rotateSpeed={0.5} />}
      </Canvas>
    </div>
  );
}
