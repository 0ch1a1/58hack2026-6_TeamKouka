import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

/** 木の成長ステージ（0〜4）。値が大きいほど成長している。 */
const MAX_STAGE = 4;

/** 幹の寸法（cylinderGeometry: [上面半径, 底面半径, ...], 高さは stage 依存）。 */
const TRUNK_TOP_RADIUS = 0.12;
const TRUNK_BOTTOM_RADIUS = 0.18;
const TRUNK_BASE_HEIGHT = 0.6;
const TRUNK_HEIGHT_PER_STAGE = 0.2;
const TRUNK_RADIAL_SEGMENTS = 8;
const TRUNK_COLOR = '#8B5E3C';

/** 葉のスケール（stage 依存）と、各層の Y オフセット・スケール係数。 */
const LEAVES_BASE_SCALE = 0.6;
const LEAVES_SCALE_PER_STAGE = 0.15;
const LEAVES_Y_FACTOR = 0.7;
const LEAVES_RADIAL_SEGMENTS = 8;

/** ステージごとの葉の色。stage を MAX_STAGE でクランプして参照する。 */
const LEAVES_COLORS = ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2'] as const;

/** 葉の各層: 表示に必要な最小 stage, Y オフセット, 親スケールへの乗数, cone の [半径, 高さ]。 */
const LEAF_LAYERS = [
  { minStage: 0, yOffset: -0.2, scaleFactor: 1, cone: [1.0, 1.4] as const },
  { minStage: 1, yOffset: 0.3, scaleFactor: 0.78, cone: [0.9, 1.3] as const },
  { minStage: 2, yOffset: 0.85, scaleFactor: 0.55, cone: [0.8, 1.2] as const },
] as const;

/** 実（最終ステージのみ）の配置と見た目。 */
const FRUIT_MIN_STAGE = MAX_STAGE;
const FRUIT_COLOR = '#E63946';
const FRUIT_RADIUS = 0.1;
const FRUIT_SEGMENTS = 8;
const FRUIT_Z = 0.3;
/** [X 位置, leavesY からの Y オフセット] の組。中央の実だけ高い位置に置く。 */
const FRUITS = [
  { x: -0.4, yOffset: 0.2 },
  { x: 0.4, yOffset: 0.2 },
  { x: 0, yOffset: 0.5 },
] as const;

/** 地面の円盤。 */
const GROUND_RADIUS = 1.2;
const GROUND_SEGMENTS = 32;
const GROUND_Y_OFFSET = -0.05;
const GROUND_COLOR = '#A8D5BA';

/** 揺れアニメーション（rotation.z = sin(t * speed) * amplitude）。 */
const SWAY_SPEED = 0.001;
const SWAY_AMPLITUDE = 0.04;

/** シーン全体の設定。 */
const BACKGROUND_COLOR = '#E8F5E9';
const CAMERA = { position: [0, 1, 4] as [number, number, number], fov: 50 };
const AMBIENT_LIGHT_INTENSITY = 0.8;
const DIRECTIONAL_LIGHT_POSITION: [number, number, number] = [3, 5, 3];
const DIRECTIONAL_LIGHT_INTENSITY = 1.2;

type TreeProps = {
  stage: number; // 0〜4: 成長ステージ
};

function Tree({ stage }: TreeProps) {
  const groupRef = useRef<THREE.Group>(null);

  // ゆっくり揺れるアニメーション
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(Date.now() * SWAY_SPEED) * SWAY_AMPLITUDE;
    }
  });

  const trunkHeight = TRUNK_BASE_HEIGHT + stage * TRUNK_HEIGHT_PER_STAGE;
  const leavesScale = LEAVES_BASE_SCALE + stage * LEAVES_SCALE_PER_STAGE;
  const leavesY = trunkHeight / 2 + leavesScale * LEAVES_Y_FACTOR;
  const leavesColor = LEAVES_COLORS[Math.min(stage, MAX_STAGE)];

  return (
    <group ref={groupRef}>
      {/* 幹 */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry
          args={[TRUNK_TOP_RADIUS, TRUNK_BOTTOM_RADIUS, trunkHeight, TRUNK_RADIAL_SEGMENTS]}
        />
        <meshBasicMaterial color={TRUNK_COLOR} />
      </mesh>

      {/* 葉（下層→上層）。stage が minStage 以上の層だけ表示する。 */}
      {LEAF_LAYERS.map(
        (layer, i) =>
          stage >= layer.minStage && (
            <mesh
              key={i}
              position={[0, leavesY + layer.yOffset, 0]}
              scale={leavesScale * layer.scaleFactor}
            >
              <coneGeometry args={[layer.cone[0], layer.cone[1], LEAVES_RADIAL_SEGMENTS]} />
              <meshBasicMaterial color={leavesColor} />
            </mesh>
          )
      )}

      {/* 実（最終ステージのみ） */}
      {stage >= FRUIT_MIN_STAGE &&
        FRUITS.map((fruit, i) => (
          <mesh key={i} position={[fruit.x, leavesY + fruit.yOffset, FRUIT_Z]}>
            <sphereGeometry args={[FRUIT_RADIUS, FRUIT_SEGMENTS, FRUIT_SEGMENTS]} />
            <meshBasicMaterial color={FRUIT_COLOR} />
          </mesh>
        ))}

      {/* 地面 */}
      <mesh
        position={[0, -trunkHeight / 2 + GROUND_Y_OFFSET, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[GROUND_RADIUS, GROUND_SEGMENTS]} />
        <meshBasicMaterial color={GROUND_COLOR} />
      </mesh>
    </group>
  );
}

export default function TreeScene({ stage }: TreeProps) {
  return (
    <Canvas
      camera={CAMERA}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: false, powerPreference: 'default' }}
      onCreated={({ gl }) => {
        gl.setClearColor(BACKGROUND_COLOR, 1);
      }}
    >
      <ambientLight intensity={AMBIENT_LIGHT_INTENSITY} />
      <directionalLight
        position={DIRECTIONAL_LIGHT_POSITION}
        intensity={DIRECTIONAL_LIGHT_INTENSITY}
        castShadow={false}
      />
      <Tree stage={stage} />
    </Canvas>
  );
}
