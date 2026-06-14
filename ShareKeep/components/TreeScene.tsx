import React, { useEffect, useRef } from 'react';
import { View, PanResponder } from 'react-native';
import { Canvas, useThree, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

type Props = {
  stage: number;
  onReady?: () => void;
  rotationRef?: React.MutableRefObject<number>;
  onInvalidate?: (fn: () => void) => void;
};

// 高さ目安: 0.42 / 0.72 / 1.38 / 2.25 / 3.65
const CAMERA_CFG = [
  { pos: [0, 0.05, 2.2] as [number, number, number], fov: 44, target: 0.0  },
  { pos: [0, 0.15, 2.8] as [number, number, number], fov: 44, target: 0.3  },
  { pos: [0, 0.38, 3.8] as [number, number, number], fov: 46, target: 0.62 },
  { pos: [0, 0.65, 5.5] as [number, number, number], fov: 49, target: 1.0  },
  { pos: [0, 1.1,  8.2] as [number, number, number], fov: 54, target: 1.62 },
];

function CameraRig({ stage }: { stage: number }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const cfg = CAMERA_CFG[stage];
    camera.position.set(...cfg.pos);
    (camera as THREE.PerspectiveCamera).fov = cfg.fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    camera.lookAt(0, cfg.target, 0);
    invalidate();
  }, [stage, camera, invalidate]);
  return null;
}

function SceneContent({ stage, rotationRef, onInvalidate, onReady }: {
  stage: number;
  rotationRef?: React.MutableRefObject<number>;
  onInvalidate?: (fn: () => void) => void;
  onReady?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const called = useRef(false);

  useEffect(() => {
    onInvalidate?.(invalidate);
    invalidate();
  }, [invalidate, onInvalidate]);

  useFrame(() => {
    if (groupRef.current && rotationRef) {
      groupRef.current.rotation.y = rotationRef.current;
    }
    if (!called.current) { called.current = true; onReady?.(); }
  });

  const StageComponent = STAGES[stage];
  return (
    <group ref={groupRef}>
      <StageComponent />
    </group>
  );
}

// 成長の各観点:
//   高さ  :  0.42 →  0.72 →  1.38 →  2.25 →  3.65
//   幹径  : 0.024 → 0.042 →  0.07 →  0.13 →  0.30
//   樹冠R :  ×   →  0.18 →  0.38 →  0.65 →  1.00
//   枝    :  0本  →  0本  →  0本  →  2本  →  4本
//   根張り:  なし →  なし →  なし →  なし →  あり
//   果実  :  なし →  なし →  なし →  なし →  あり

// ── Stage 0: 芽吹き（双葉の芽、高さ0.42） ──────────
function Stage0() {
  return (
    <group>
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.016, 0.024, 0.52, 6]} />
        <meshBasicMaterial color="#52B788" />
      </mesh>
      <mesh position={[-0.12, 0.12, 0]} scale={[1, 0.5, 0.55]} rotation={[0.1, 0, 0.5]}>
        <sphereGeometry args={[0.095, 8, 8]} />
        <meshBasicMaterial color="#74C69D" />
      </mesh>
      <mesh position={[0.12, 0.12, 0]} scale={[1, 0.5, 0.55]} rotation={[0.1, 0, -0.5]}>
        <sphereGeometry args={[0.095, 8, 8]} />
        <meshBasicMaterial color="#74C69D" />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <sphereGeometry args={[0.038, 6, 6]} />
        <meshBasicMaterial color="#95D5B2" />
      </mesh>
      <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.82, 16]} />
        <meshBasicMaterial color="#A8D5BA" />
      </mesh>
    </group>
  );
}

// ── Stage 1: 苗木（短い幹＋こぶし大の葉房、高さ0.72） ─
function Stage1() {
  return (
    <group>
      {/* 幹: 径0.028→0.042、高さ0.48 */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.028, 0.042, 0.48, 6]} />
        <meshBasicMaterial color="#8B5E3C" />
      </mesh>
      {/* 小さな葉かたまり（1＋2個のみ） */}
      <mesh position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshBasicMaterial color="#74C69D" />
      </mesh>
      <mesh position={[-0.14, 0.38, 0.05]}>
        <sphereGeometry args={[0.1, 7, 7]} />
        <meshBasicMaterial color="#95D5B2" />
      </mesh>
      <mesh position={[0.14, 0.38, 0.05]}>
        <sphereGeometry args={[0.1, 7, 7]} />
        <meshBasicMaterial color="#95D5B2" />
      </mesh>
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 16]} />
        <meshBasicMaterial color="#A8D5BA" />
      </mesh>
    </group>
  );
}

// ── Stage 2: 若芽（幹が伸び、葉房が充実、高さ1.38） ──
function Stage2() {
  return (
    <group>
      {/* 幹: 径0.04→0.07、高さ1.05 */}
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.04, 0.07, 1.05, 7]} />
        <meshBasicMaterial color="#8B5E3C" />
      </mesh>
      {/* 中心の葉かたまり */}
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.38, 9, 9]} />
        <meshBasicMaterial color="#52B788" />
      </mesh>
      {/* 周囲の葉クラスター（3個） */}
      <mesh position={[-0.26, 0.9, 0.1]}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshBasicMaterial color="#74C69D" />
      </mesh>
      <mesh position={[0.26, 0.9, 0.1]}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshBasicMaterial color="#74C69D" />
      </mesh>
      <mesh position={[0.04, 1.05, 0.3]}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshBasicMaterial color="#95D5B2" />
      </mesh>
      {/* 頂部の小ふくらみ */}
      <mesh position={[0, 1.35, 0.04]}>
        <sphereGeometry args={[0.16, 7, 7]} />
        <meshBasicMaterial color="#95D5B2" />
      </mesh>
      <mesh position={[0, -0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.0, 16]} />
        <meshBasicMaterial color="#A8D5BA" />
      </mesh>
    </group>
  );
}

// ── Stage 3: 若木（枝2本が出現、樹冠拡大、高さ2.25） ─
function Stage3() {
  return (
    <group>
      {/* 幹: 径0.08→0.13、高さ1.5 */}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.08, 0.13, 1.5, 8]} />
        <meshBasicMaterial color="#7B5230" />
      </mesh>
      {/* 枝（左右に2本） */}
      <mesh position={[-0.21, 0.85, 0.05]} rotation={[0.1, 0, 0.52]}>
        <cylinderGeometry args={[0.024, 0.048, 0.46, 5]} />
        <meshBasicMaterial color="#7B5230" />
      </mesh>
      <mesh position={[0.21, 0.85, 0.05]} rotation={[0.1, 0, -0.52]}>
        <cylinderGeometry args={[0.024, 0.048, 0.46, 5]} />
        <meshBasicMaterial color="#7B5230" />
      </mesh>
      {/* 中心の樹冠 */}
      <mesh position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.65, 10, 10]} />
        <meshBasicMaterial color="#40916C" />
      </mesh>
      {/* 側面の葉かたまり（4個） */}
      <mesh position={[-0.5, 1.42, 0.08]}>
        <sphereGeometry args={[0.42, 9, 9]} />
        <meshBasicMaterial color="#52B788" />
      </mesh>
      <mesh position={[0.5, 1.42, 0.08]}>
        <sphereGeometry args={[0.42, 9, 9]} />
        <meshBasicMaterial color="#52B788" />
      </mesh>
      <mesh position={[0.05, 1.62, 0.52]}>
        <sphereGeometry args={[0.35, 9, 9]} />
        <meshBasicMaterial color="#74C69D" />
      </mesh>
      <mesh position={[-0.2, 2.0, 0.2]}>
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshBasicMaterial color="#74C69D" />
      </mesh>
      {/* 頂部 */}
      <mesh position={[0, 2.22, 0]}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshBasicMaterial color="#95D5B2" />
      </mesh>
      <mesh position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.2, 16]} />
        <meshBasicMaterial color="#A8D5BA" />
      </mesh>
    </group>
  );
}

// ── Stage 4: 実りの木（根張り・枝4本・大樹冠・果実、高さ3.65）
function Stage4() {
  const fruits: [number, number, number][] = [
    [-0.62, 2.38, 0.68], [0.65, 2.28, 0.58], [0.05, 2.78, 0.95],
    [-0.38, 3.02, 0.42], [0.52, 3.08, 0.65], [-0.75, 2.58, 0.25],
    [0.2,  2.18, 0.88],  [-0.28, 3.28, 0.5], [0.55, 2.68, 0.82],
    [-0.45, 2.72, 0.75],
  ];
  return (
    <group>
      {/* 幹: 径0.2→0.3、高さ2.4 */}
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 2.4, 10]} />
        <meshBasicMaterial color="#4A2C0A" />
      </mesh>
      {/* 根張り（地際フレア、4方向） */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={i}
          position={[Math.cos(i * Math.PI / 2) * 0.3, -0.65, Math.sin(i * Math.PI / 2) * 0.3]}
          rotation={[Math.sin(i * Math.PI / 2) * 0.28, 0, Math.cos(i * Math.PI / 2) * 0.42]}
        >
          <cylinderGeometry args={[0.04, 0.12, 0.55, 5]} />
          <meshBasicMaterial color="#4A2C0A" />
        </mesh>
      ))}
      {/* 主要枝（4本：左右＋前後） */}
      <mesh position={[-0.42, 1.70, 0.05]} rotation={[0.08, 0, 0.5]}>
        <cylinderGeometry args={[0.055, 0.1, 0.78, 6]} />
        <meshBasicMaterial color="#4A2C0A" />
      </mesh>
      <mesh position={[0.42, 1.70, 0.05]} rotation={[0.08, 0, -0.5]}>
        <cylinderGeometry args={[0.055, 0.1, 0.78, 6]} />
        <meshBasicMaterial color="#4A2C0A" />
      </mesh>
      <mesh position={[0.08, 1.80, 0.38]} rotation={[0.48, 0, 0.08]}>
        <cylinderGeometry args={[0.042, 0.085, 0.65, 5]} />
        <meshBasicMaterial color="#4A2C0A" />
      </mesh>
      <mesh position={[0.05, 1.62, -0.34]} rotation={[-0.42, 0, -0.05]}>
        <cylinderGeometry args={[0.038, 0.078, 0.58, 5]} />
        <meshBasicMaterial color="#4A2C0A" />
      </mesh>
      {/* 中心の大樹冠 */}
      <mesh position={[0, 2.95, 0]}>
        <sphereGeometry args={[1.0, 12, 12]} />
        <meshBasicMaterial color="#1B4332" />
      </mesh>
      {/* 側面の大葉かたまり（5個） */}
      <mesh position={[-0.88, 2.52, 0.12]}>
        <sphereGeometry args={[0.72, 11, 11]} />
        <meshBasicMaterial color="#2D6A4F" />
      </mesh>
      <mesh position={[0.88, 2.52, 0.12]}>
        <sphereGeometry args={[0.72, 11, 11]} />
        <meshBasicMaterial color="#2D6A4F" />
      </mesh>
      <mesh position={[0.12, 2.58, 0.85]}>
        <sphereGeometry args={[0.65, 10, 10]} />
        <meshBasicMaterial color="#40916C" />
      </mesh>
      <mesh position={[-0.45, 3.08, 0.42]}>
        <sphereGeometry args={[0.48, 10, 10]} />
        <meshBasicMaterial color="#40916C" />
      </mesh>
      <mesh position={[0.42, 3.12, 0.38]}>
        <sphereGeometry args={[0.45, 9, 9]} />
        <meshBasicMaterial color="#52B788" />
      </mesh>
      {/* 頂部 */}
      <mesh position={[0, 3.78, 0]}>
        <sphereGeometry args={[0.52, 10, 10]} />
        <meshBasicMaterial color="#52B788" />
      </mesh>
      {/* 果実（10個） */}
      {fruits.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshBasicMaterial color="#E63946" />
        </mesh>
      ))}
      <mesh position={[0, -0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.65, 16]} />
        <meshBasicMaterial color="#A8D5BA" />
      </mesh>
    </group>
  );
}

const STAGES = [Stage0, Stage1, Stage2, Stage3, Stage4];

export default function TreeScene({ stage, onReady, rotationRef: externalRotRef, onInvalidate }: Props) {
  const s = Math.min(4, Math.max(0, stage));

  // 回転値は外部 ref があればそれを使い、なければ内部 ref を使う
  const localRotRef = useRef(0);
  const rotRef = externalRotRef ?? localRotRef;

  // Canvas 内の invalidate 関数をここから呼べるよう ref で保持
  const invalidateFnRef = useRef<(() => void) | null>(null);

  // ドラッグ回転。dx は累積値なので前フレームとの差分を使う
  const prevDxRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { prevDxRef.current = 0; },
      onPanResponderMove: (_, g) => {
        const delta = g.dx - prevDxRef.current;
        prevDxRef.current = g.dx;
        rotRef.current += delta * 0.012;
        invalidateFnRef.current?.();
      },
    }),
  ).current;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <Canvas
        camera={{ position: CAMERA_CFG[0].pos, fov: CAMERA_CFG[0].fov }}
        frameloop="demand"
        dpr={1}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => { gl.setClearColor('#E8F5E9', 1); }}
      >
        <CameraRig stage={s} />
        <SceneContent
          stage={s}
          rotationRef={rotRef}
          onInvalidate={(fn) => {
            invalidateFnRef.current = fn;
            onInvalidate?.(fn);
          }}
          onReady={onReady}
        />
      </Canvas>
    </View>
  );
}
