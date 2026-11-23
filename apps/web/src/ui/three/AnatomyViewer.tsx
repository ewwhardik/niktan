import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box3, Color, Group, Mesh, MeshPhysicalMaterial, NeutralToneMapping, PMREMGenerator, Vector3, type Material, type MeshStandardMaterial, type PerspectiveCamera } from 'three';
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
  /** Vertical label offset in px, to keep neighbouring labels apart. The ring stays on the anchor. */
  dy?: number;
}

const TONE: Record<CalloutTone, string> = {
  normal: 'var(--routine)',
  check: 'var(--seetoday)',
  alert: 'var(--emergency)',
  none: 'currentColor',
};

/** Medical-illustration callout: label, hairline leader and a hollow ring on the anatomy. */
function CalloutPin({ c, dark, selected, onSelect }: { c: Callout; dark: boolean; selected: boolean; onSelect?: ((id: string) => void) | undefined }) {
  const left = c.side === 'left';
  return (
    <Html position={c.at} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`flex items-center ${dark ? 'text-white' : 'text-[#1d1d1f]'}`} style={{ transform: `translateX(${left ? '-50%' : '50%'})` }}>
        <div className={`flex items-center ${left ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className={`max-w-[6.5rem] sm:max-w-none sm:whitespace-nowrap ${left ? 'text-right' : 'text-left'}`} style={{ transform: c.dy ? `translateY(${c.dy}px)` : undefined }}>
            {onSelect ? <button type="button" aria-pressed={selected} onClick={() => onSelect(c.id)} className={`pointer-events-auto min-h-11 rounded-full px-3 text-label shadow-1 ${selected ? 'bg-[#1d1d1f] text-white' : 'bg-white text-[#1d1d1f]'}`}>{c.label}</button> : <p className="text-[13px] leading-tight font-medium opacity-80">{c.label}</p>}
            {c.value && <p className="tnum text-[13px] leading-tight font-semibold">{c.value}</p>}
          </div>
          <svg width="64" height="40" className="mx-1 shrink-0 overflow-visible" aria-hidden>
            <path d={left ? `M0 ${20 + (c.dy ?? 0)} H36 L64 20` : `M64 ${20 + (c.dy ?? 0)} H28 L0 20`} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
          </svg>
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
  // The prepared models carry medical-illustration colours per structure; keep any non-white colour.
  const hasOwnColour = !!original?.map || vertexColours || (!!original?.color && original.color.getHexString() !== 'ffffff');
  const name = `${mesh.name} ${original?.name ?? ''}`;
  const colour = model === 'heart' ? (VEIN.test(name) ? '#2f5fa8' : ARTERY.test(name) ? '#c62a2a' : '#b23a30') : '#a8382e';
  return new MeshPhysicalMaterial({
    color: hasOwnColour ? (original?.color?.clone() ?? new Color('#ffffff')) : new Color(colour),
    map: original?.map ?? null,
    normalMap: original?.normalMap ?? null,
    vertexColors: vertexColours,
    roughness: model === 'heart' ? 0.42 : 0.5,
    metalness: 0,
    clearcoat: model === 'heart' ? 0.8 : 0.45,
    clearcoatRoughness: 0.22,
  });
}

/** Soft studio lighting without downloading an HDR file. */
function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    // Softer fill so colours stay saturated; key and rim lights do the shaping.
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function GlbModel({ model, bpm, sway }: { model: Model; bpm?: number | null; sway: boolean }) {
  // sway=false also means reduced motion: no swaying and no heartbeat scaling.
  const { scene } = useGLTF(`/models/${model}.glb`);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.material = anatomyMaterial(model, m);
    });
    // Normalise to height 2 centred on the origin, the frame the callout anchors are written in.
    const box = new Box3().setFromObject(clone);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const k = size.y > 0 ? 2 / size.y : 1;
    clone.scale.multiplyScalar(k);
    clone.position.sub(centre.multiplyScalar(k));
    clone.userData.extent = { w: size.x * k, h: size.y * k, d: size.z * k };
    return clone;
  }, [scene, model]);

  // Fit the camera to the model and the card's aspect, leaving room at the sides for callouts.
  const { camera, size: view } = useThree();
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const ext = object.userData.extent as { w: number; h: number; d: number };
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (view.width / view.height));
    const sideRoom = model === 'body' ? 3.2 : 1.25;
    const dH = (ext.h / 2) * 1.12 / Math.tan(vfov / 2);
    const dW = ((ext.w * sideRoom) / 2) / Math.tan(hfov / 2);
    cam.position.set(0, 0, Math.max(dH, dW) + ext.d / 2);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, view.width, view.height, object, model]);
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!group.current) return;
    if (sway) group.current.rotation.y = Math.sin(t * 0.3) * 0.35;
    group.current.scale.setScalar(sway && model === 'heart' && bpm ? 1 + 0.035 * beat(t, bpm) : 1);
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
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    // Release the probe context straight away; browsers cap live WebGL contexts.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

const available = new Map<Model, Promise<boolean>>();
/** One cheap HEAD per model, so a missing file never triggers a failing loader. */
function modelExists(model: Model): Promise<boolean> {
  let p = available.get(model);
  if (!p) {
    p = fetch(`/models/${model}.glb`, { method: 'HEAD' })
      .then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html'))
      .catch(() => false);
    available.set(model, p);
  }
  return p;
}

export interface AnatomyViewerProps {
  model: Model;
  callouts?: Callout[];
  bpm?: number | null;
  selectedId?: string;
  onSelect?: (id: string) => void;
  interactive?: boolean;
  /** Light callout text for dark cards. */
  dark?: boolean;
  className?: string;
  /** Camera distance; smaller = closer. */
  zoom?: number;
  /** Shown when WebGL or the model file is unavailable. */
  fallback?: ReactNode;
}

export default function AnatomyViewer({ model, callouts = [], bpm, selectedId, onSelect, interactive = true, dark = false, className = '', zoom, fallback = null }: AnatomyViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [foreground, setForeground] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const [gl] = useState(webglAvailable);
  const [failed, setFailed] = useState(false);
  const [exists, setExists] = useState<boolean | null>(null);
  // Rotating with a finger would hijack page scrolling, so touch devices get the gentle sway only.
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  useEffect(() => {
    let live = true;
    void modelExists(model).then((ok) => live && setExists(ok));
    return () => {
      live = false;
    };
  }, [model]);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Rendering stops entirely while the viewer is scrolled offscreen.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, [exists]);

  if (!gl || failed || exists === false) return <div className={className}>{fallback}</div>;
  if (exists === null) return <div ref={host} className={className} />;
  const distance = zoom ?? (model === 'body' ? 4.3 : 3.7);

  return (
    <div ref={host} className={`relative ${className}`}>
      <Canvas
        frameloop={!visible || !foreground ? 'never' : reduce ? 'demand' : 'always'}
        dpr={perfTier === 'lite' ? 1 : [1, 2]}
        camera={{ position: [0, model === 'body' ? 0.1 : 0, distance], fov: 35 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power', toneMapping: NeutralToneMapping }}
        role="img"
        aria-label={model === 'body' ? 'Body map' : 'Heart'}
        style={{ touchAction: 'pan-y' }}
      >
        <StudioEnvironment />
        <ambientLight intensity={0.12} />
        <directionalLight position={[2.5, 3, 3.5]} intensity={1.9} />
        <directionalLight position={[-3, 1.5, -2]} intensity={1.4} color="#b8d4ff" />
        <directionalLight position={[0, -2, 2]} intensity={0.35} color="#ffd9c7" />
        <ModelBoundary onFail={() => setFailed(true)}>
          <Suspense fallback={null}>
            <GlbModel model={model} bpm={bpm} sway={!reduce} />
          </Suspense>
        </ModelBoundary>
        <ContactShadows position={[0, -1.02, 0]} opacity={dark ? 0.6 : 0.35} scale={4} blur={2.6} far={2} resolution={256} />
        {callouts.map((c) => (
          <CalloutPin key={c.id} c={c} dark={dark} selected={selectedId === c.id} onSelect={onSelect} />
        ))}
        {interactive && !coarse && <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.6} maxPolarAngle={Math.PI / 1.7} minAzimuthAngle={-Math.PI / 3} maxAzimuthAngle={Math.PI / 3} rotateSpeed={0.5} />}
      </Canvas>
    </div>
  );
}
