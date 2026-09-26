import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import {
  Satellite,
  Compass,
  ChevronDown,
  Layers,
  Radio,
  Droplets,
  Sparkles,
  Minimize2,
  Activity,
  Globe2,
} from 'lucide-react';

interface GalaxyHeroProps {
  onSelectPreset: (presetName: string) => void;
  onStartTour: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// ---------------------------------------------------------------------------
// Clean & Lightweight Procedural Earth Surface Texture (Canvas)
// ---------------------------------------------------------------------------
function createSimpleEarthTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Deep ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#061329');
  oceanGrad.addColorStop(0.3, '#0b2a59');
  oceanGrad.addColorStop(0.7, '#0b2a59');
  oceanGrad.addColorStop(1, '#061329');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  const toX = (lon: number) => ((lon + 180) / 360) * width;
  const toY = (lat: number) => ((90 - lat) / 180) * height;

  const drawLand = (coords: [number, number][], fill: string) => {
    ctx.beginPath();
    ctx.moveTo(toX(coords[0][0]), toY(coords[0][1]));
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(toX(coords[i][0]), toY(coords[i][1]));
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();
  };

  // Major Continents & Landmasses
  drawLand([[-165, 68], [-140, 58], [-122, 38], [-105, 20], [-80, 25], [-65, 45], [-80, 65], [-140, 70]], '#1b4d3e');
  drawLand([[-50, 62], [-20, 75], [-35, 83], [-55, 78]], '#e2e8f0');
  drawLand([[-80, 8], [-35, -5], [-45, -24], [-68, -52], [-75, -45], [-80, -2]], '#14532d');
  drawLand([[-10, 36], [0, 50], [15, 65], [30, 60], [25, 40], [0, 38]], '#1e5237');
  drawLand([[-17, 32], [32, 30], [50, 10], [35, -20], [20, -34], [10, -5], [-15, 12]], '#92400e');
  drawLand([[8, 5], [30, 5], [35, -15], [12, -15]], '#166534');
  drawLand([[35, 65], [100, 72], [165, 65], [140, 40], [105, 20], [75, 12], [45, 30]], '#1c4d37');
  drawLand([[68, 24], [78, 28], [82, 10], [77, 8]], '#a16207');
  drawLand([[115, -20], [145, -15], [150, -35], [120, -35]], '#c2410c');
  drawLand([[-180, -75], [0, -70], [180, -75], [180, -90], [-180, -90]], '#f1f5f9');

  // Major glowing city lights on dark side
  const cities: [number, number][] = [
    [-74, 40.7], [-118.2, 34], [-0.1, 51.5], [2.3, 48.8],
    [139.7, 35.6], [121.4, 31.2], [77.2, 28.6], [55.3, 25.2],
    [-46.6, -23.5], [151.2, -33.8],
  ];
  cities.forEach(([lon, lat]) => {
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(toX(lon), toY(lat), 3, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// ---------------------------------------------------------------------------
// Clean Procedural Cloud Texture
// ---------------------------------------------------------------------------
function createSimpleCloudsTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < 35; i++) {
    const x = Math.random() * width;
    const y = 40 + Math.random() * (height - 80);
    const radiusX = 40 + Math.random() * 90;
    const radiusY = 12 + Math.random() * 25;

    const grad = ctx.createRadialGradient(x, y, 2, x, y, radiusX);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
    grad.addColorStop(0.5, 'rgba(240, 248, 255, 0.3)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, Math.random() * 0.4 - 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// ---------------------------------------------------------------------------
// GalaxyHero Component
// ---------------------------------------------------------------------------
export const GalaxyHero: React.FC<GalaxyHeroProps> = ({
  onSelectPreset,
  onStartTour,
  isCollapsed,
  onToggleCollapse,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [telemetry, setTelemetry] = useState({
    altitude: 786.4,
    velocity: 7.45,
    lat: 45.4215,
    lon: -75.6972,
    mode: 'MSI + SAR DUAL-BAND',
  });

  const { scrollY } = useScroll();
  const scrollProgressRef = useRef(0);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    // Map scroll position 0..400px to a 0..1 progress value for camera interpolation
    const progress = Math.min(1, latest / 400);
    scrollProgressRef.current = progress;

    // Auto-collapse once the user has scrolled past ~75% of the hero
    if (latest > 300 && !isCollapsed) {
      onToggleCollapse();
    }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        altitude: +(786.2 + Math.sin(Date.now() / 4000) * 0.4).toFixed(1),
        velocity: +(7.452 + Math.cos(Date.now() / 5000) * 0.004).toFixed(3),
        lat: +((prev.lat + 0.02) % 90).toFixed(4),
        lon: +(((prev.lon + 0.03 + 180) % 360) - 180).toFixed(4),
      }));
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Three.js Cinematic Scene with Postprocessing
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    // Start at wide galaxy view
    camera.position.set(0, 2.2, 13.5);

    // 2. WebGL Renderer with ACES tone mapping for cinematic look
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // 3. 5,000-Star Starfield Particle System
    const starsCount = 5000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starsCount * 3);
    const starColors = new Float32Array(starsCount * 3);
    const starSizes = new Float32Array(starsCount);

    const colors = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#93c5fd'),
      new THREE.Color('#38bdf8'),
      new THREE.Color('#fef08a'),
      new THREE.Color('#fbbf24'),
    ];

    for (let i = 0; i < starsCount; i++) {
      const radius = 180 + Math.random() * 450;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = radius * Math.cos(phi);

      const col = colors[Math.floor(Math.random() * colors.length)];
      starColors[i * 3] = col.r;
      starColors[i * 3 + 1] = col.g;
      starColors[i * 3 + 2] = col.b;

      // Vary star sizes for depth perception
      starSizes[i] = 0.5 + Math.random() * 2.0;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

    // Custom shader material for crisp round stars with soft glow
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uTime;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // Twinkle effect
          float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + position.x * 0.1 + position.y * 0.05);
          gl_PointSize = size * twinkle * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const starfield = new THREE.Points(starGeometry, starMaterial);
    scene.add(starfield);

    // 4. Lights: Sun Directional + Ambient Space Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    sunLight.position.set(-12, 6, 10);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x0f172a, 1.2);
    scene.add(ambientLight);

    // 5. Earth Planetary Group
    const earthGroup = new THREE.Group();
    earthGroup.position.set(3.2, -0.2, 0);
    scene.add(earthGroup);

    const earthRadius = 4.0;

    // Standard Textured Earth Mesh with higher geometry detail for crisp shading
    const earthTexture = createSimpleEarthTexture();
    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.6,
      metalness: 0.1,
      emissive: new THREE.Color(0x0a1a2a),
      emissiveIntensity: 0.15,
    });
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(earthRadius, 64, 64),
      earthMaterial
    );
    earthGroup.add(earthMesh);

    // Wispy Cloud Layer with faster rotation
    const cloudsTexture = createSimpleCloudsTexture();
    const cloudMaterial = new THREE.MeshStandardMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(
      new THREE.SphereGeometry(earthRadius + 0.05, 48, 48),
      cloudMaterial
    );
    earthGroup.add(cloudsMesh);

    // Gentle Atmospheric Glow Rim with refined shader
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
          gl_FragColor = vec4(0.2, 0.7, 1.0, 1.0) * intensity * 0.85;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(earthRadius + 0.22, 48, 48),
      atmosphereMaterial
    );
    earthGroup.add(atmosphereMesh);

    // Coordinate Orbit Ring
    const orbitCurve = new THREE.EllipseCurve(0, 0, 5.8, 5.4, 0, 2 * Math.PI, false, 0);
    const orbitPoints = orbitCurve.getPoints(96);
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
      orbitPoints.map((p) => new THREE.Vector3(p.x, 0, p.y))
    );
    const orbitLine = new THREE.Line(
      orbitGeometry,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 })
    );
    orbitLine.rotation.x = Math.PI / 2.3;
    orbitLine.rotation.y = 0.3;
    earthGroup.add(orbitLine);

    // Orbiting Satellite Marker
    const satGroup = new THREE.Group();
    const satBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.3 })
    );
    satGroup.add(satBody);

    const solarWing = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.02, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.6, roughness: 0.3 })
    );
    solarWing.position.x = 0.42;
    satGroup.add(solarWing);

    const solarWing2 = solarWing.clone();
    solarWing2.position.x = -0.42;
    satGroup.add(solarWing2);

    earthGroup.add(satGroup);

    // 6. Postprocessing: EffectComposer with UnrealBloomPass
    const composer = new EffectComposer(renderer);
    composer.setSize(width, height);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Tuned UnrealBloomPass: enough glow for cinematic feel, not blinding
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.45,  // strength: moderate, avoids overexposure
      0.6,   // radius: soft spread
      0.7    // threshold: only bright elements bloom
    );
    composer.addPass(bloomPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // 7. Interactive Mouse Parallax & Animation Loop
    let mouseX = 0;
    let mouseY = 0;
    let targetCameraX = 0;
    let targetCameraY = 2.2;

    // Camera keyframes for scroll-triggered interpolation
    // Wide galaxy view → focused orbital Earth view
    const cameraWide = { x: 0, y: 2.2, z: 13.5, lookAt: new THREE.Vector3(1.2, 0, 0) };
    const cameraFocus = { x: 1.8, y: 0.5, z: 8.5, lookAt: new THREE.Vector3(3.2, -0.2, 0) };
    let currentScrollProgress = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const normX = (e.clientX / window.innerWidth) * 2 - 1;
      const normY = -(e.clientY / window.innerHeight) * 2 + 1;
      mouseX = normX * 0.7;
      mouseY = normY * 0.4;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    let animationFrameId: number;
    let satAngle = 0;
    const clock = new THREE.Clock();

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Clean Gentle Planetary & Cloud Rotations
      earthMesh.rotation.y += 0.0012;
      cloudsMesh.rotation.y += 0.0018;
      starfield.rotation.y += 0.0001;

      // Update star twinkle
      starMaterial.uniforms.uTime.value = elapsed;

      // Orbit Satellite
      satAngle += 0.012;
      const rX = 5.8 * Math.cos(satAngle);
      const rZ = 5.4 * Math.sin(satAngle);
      const satPos = new THREE.Vector3(rX, 0, rZ);
      satPos.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2.3);
      satPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
      satGroup.position.copy(satPos);
      satGroup.lookAt(earthMesh.position);

      // Smooth scroll-triggered camera interpolation
      const targetProgress = scrollProgressRef.current;
      currentScrollProgress += (targetProgress - currentScrollProgress) * 0.06;

      const p = currentScrollProgress;
      // Ease in-out for butter-smooth transition
      const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      const baseX = lerp(cameraWide.x, cameraFocus.x, easedP);
      const baseY = lerp(cameraWide.y, cameraFocus.y, easedP);
      const baseZ = lerp(cameraWide.z, cameraFocus.z, easedP);

      // Add mouse parallax on top of scroll interpolation
      targetCameraX = baseX + mouseX * 1.2 * (1 - easedP * 0.5);
      targetCameraY = baseY + mouseY * 0.6 * (1 - easedP * 0.5);

      camera.position.x += (targetCameraX - camera.position.x) * 0.05;
      camera.position.y += (targetCameraY - camera.position.y) * 0.05;
      camera.position.z += (baseZ - camera.position.z) * 0.05;

      // Smoothly interpolate lookAt target
      const lookTarget = new THREE.Vector3(
        lerp(cameraWide.lookAt.x, cameraFocus.lookAt.x, easedP),
        lerp(cameraWide.lookAt.y, cameraFocus.lookAt.y, easedP),
        lerp(cameraWide.lookAt.z, cameraFocus.lookAt.z, easedP)
      );
      camera.lookAt(lookTarget);

      composer.render();
    };

    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      composer.dispose();
      bloomPass.dispose();
      renderer.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      earthMesh.geometry.dispose();
      earthMaterial.dispose();
      cloudsMesh.geometry.dispose();
      cloudMaterial.dispose();
      atmosphereMesh.geometry.dispose();
      atmosphereMaterial.dispose();
      orbitGeometry.dispose();
      earthTexture.dispose();
      cloudsTexture.dispose();
    };
  }, []);

  return (
    <motion.section
      ref={heroRef}
      id="astra-galaxy-hero"
      initial={{ height: '100vh', opacity: 1 }}
      animate={{
        height: isCollapsed ? 0 : '100vh',
        opacity: isCollapsed ? 0 : 1,
      }}
      transition={{
        height: { duration: 0.75, ease: [0.16, 1, 0.3, 1] },
        opacity: { duration: 0.4, ease: 'easeOut' },
      }}
      className="relative w-full overflow-hidden bg-slate-950 text-white select-none z-40 border-b border-slate-900"
    >
      {/* 3D Three.js Galaxy Canvas Mounting Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Atmospheric Subtle Radial Cosmic Gradients */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,0.08),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.06),transparent_60%)]" />

      {/* Astra Style Hero HUD & Content Overlay */}
      <div className="relative z-10 max-w-7xl mx-auto h-full flex flex-col justify-between p-6 md:p-10 pointer-events-auto">
        {/* Top Orbit HUD Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-950/40">
              <Satellite className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wider text-sm uppercase text-slate-200">
                  SatQuery AI
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 tracking-wider">
                  ORBITAL OPS
                </span>
              </div>
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                Live Sensor Telemetry: Sentinel-2 MSI & Sentinel-1 SAR
              </span>
            </div>
          </div>

          {/* Quick Controls on Hero Header */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-300 hover:text-white transition shadow-sm cursor-pointer"
              title="Collapse 3D Orbit section and reveal geospatial dashboard"
            >
              <Minimize2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Collapse Hero</span>
            </button>
          </div>
        </div>

        {/* Center Main Editorial Astra Hero Title & Copy */}
        <div className="max-w-2xl my-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-cyan-500/40 text-cyan-300 text-xs font-semibold backdrop-blur-md shadow-md">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            <span>GEMINI 3.8 VISION-LANGUAGE AGENT FOR EARTH OBSERVATION</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.08] text-white">
              Planetary Vision.
              <br />
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                Orbital Intelligence.
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl pt-2">
              Query multi-spectral Sentinel-2 and radar Sentinel-1 rasters with zero manual GIS scripting.
              Extract pixel-level land cover, track flood inundation, fuse optical and radar backscatter,
              and confer via real-time conversational voice.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              id="hero-launch-dashboard-btn"
              onClick={onToggleCollapse}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-600 hover:from-cyan-400 hover:to-emerald-500 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-950/60 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ring-2 ring-cyan-400/50"
            >
              <Globe2 className="w-4 h-4 text-slate-950" />
              <span>Launch Geospatial Dashboard</span>
              <ChevronDown className="w-4 h-4 text-slate-950 animate-bounce" />
            </button>

            <button
              type="button"
              id="hero-take-tour-btn"
              onClick={onStartTour}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-200 hover:text-white font-semibold text-sm backdrop-blur-md transition cursor-pointer shadow-lg"
            >
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>Take Interactive Tour</span>
            </button>
          </div>

          {/* Quick Mission Preset Chips */}
          <div className="pt-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Quick Mission Presets:
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'Land Cover', icon: Layers, desc: 'Water / Veg / Built-up' },
                { name: 'Change Detection', icon: Activity, desc: 'Temporal Shift' },
                { name: 'Flood Risk', icon: Droplets, desc: 'NDWI Inundation' },
                { name: 'Optical–SAR Fusion', icon: Radio, desc: 'Radar Backscatter' },
              ].map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      onSelectPreset(p.name);
                      onToggleCollapse();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/70 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/50 text-xs text-slate-300 hover:text-white transition cursor-pointer backdrop-blur-sm"
                  >
                    <Icon className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Orbit Telemetry HUD Bar & Scroll Down Prompt */}
        <div className="pt-4 border-t border-slate-900/80 flex flex-col md:flex-row md:items-end justify-between gap-4">
          {/* Live Telemetry Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Orbit Altitude</span>
              <span className="font-mono font-semibold text-cyan-400">{telemetry.altitude} km SSO</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Ground Speed</span>
              <span className="font-mono font-semibold text-emerald-400">{telemetry.velocity} km/s</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Sub-Satellite Point</span>
              <span className="font-mono font-semibold text-slate-200">
                {telemetry.lat}°N, {telemetry.lon}°W
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Sensor Band</span>
              <span className="font-mono font-semibold text-indigo-300">10m MSI / 5m SAR</span>
            </div>
          </div>

          {/* Animated Scroll Down Indicator */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition cursor-pointer self-center md:self-auto group"
            title="Scroll down to explore satellite raster pipeline"
          >
            <span>SCROLL OR CLICK TO ENTER DASHBOARD</span>
            <div className="w-5 h-8 rounded-full border-2 border-slate-700 group-hover:border-cyan-400 flex items-start justify-center p-1 transition-colors">
              <div className="w-1 h-2 rounded-full bg-cyan-400 animate-bounce" />
            </div>
          </button>
        </div>
      </div>
    </motion.section>
  );
};
