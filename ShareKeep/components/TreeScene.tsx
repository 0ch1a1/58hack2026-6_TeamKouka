import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

type TreeProps = {
  stage: number; // 0〜4: 成長ステージ
};

function Tree({ stage }: TreeProps) {
  const groupRef = useRef<THREE.Group>(null);

  // ゆっくり揺れるアニメーション
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.z =
        Math.sin(Date.now() * 0.001) * 0.04;
    }
  });

  const trunkHeight = 0.6 + stage * 0.2;
  const leavesScale = 0.6 + stage * 0.15;
  const leavesY = trunkHeight / 2 + leavesScale * 0.7;

  const trunkColor = '#8B5E3C';
  const leavesColors = ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2'];
  const leavesColor = leavesColors[Math.min(stage, 4)];

  return (
    <group ref={groupRef}>
      {/* 幹 */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.18, trunkHeight, 8]} />
        <meshBasicMaterial color={trunkColor} />
      </mesh>

      {/* 葉（下層） */}
      <mesh position={[0, leavesY - 0.2, 0]} scale={leavesScale}>
        <coneGeometry args={[1.0, 1.4, 8]} />
        <meshBasicMaterial color={leavesColor} />
      </mesh>

      {/* 葉（中層） */}
      {stage >= 1 && (
        <mesh position={[0, leavesY + 0.3, 0]} scale={leavesScale * 0.78}>
          <coneGeometry args={[0.9, 1.3, 8]} />
          <meshBasicMaterial color={leavesColor} />
        </mesh>
      )}

      {/* 葉（上層） */}
      {stage >= 2 && (
        <mesh position={[0, leavesY + 0.85, 0]} scale={leavesScale * 0.55}>
          <coneGeometry args={[0.8, 1.2, 8]} />
          <meshBasicMaterial color={leavesColor} />
        </mesh>
      )}

      {/* 実（ステージ4のみ） */}
      {stage >= 4 && (
        <>
          {[-0.4, 0.4, 0].map((x, i) => (
            <mesh key={i} position={[x, leavesY + (i === 2 ? 0.5 : 0.2), 0.3]}>
              <sphereGeometry args={[0.1, 8, 8]} />
              <meshBasicMaterial color="#E63946" />
            </mesh>
          ))}
        </>
      )}

      {/* 地面 */}
      <mesh position={[0, -trunkHeight / 2 - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.2, 32]} />
        <meshBasicMaterial color="#A8D5BA" />
      </mesh>
    </group>
  );
}

export default function TreeScene({ stage }: TreeProps) {
  return (
    <Canvas
      camera={{ position: [0, 1, 4], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: false, powerPreference: 'default' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#E8F5E9', 1);
      }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 3]} intensity={1.2} castShadow={false} />
      <Tree stage={stage} />
    </Canvas>
  );
}
