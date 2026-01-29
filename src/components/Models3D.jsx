import { useGLTF, useFBX, useTexture } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

// Model paths (from public folder)
const MODEL_PATHS = {
  robot: '/models/conveyor/robot-arm-a.glb',
  robotB: '/models/conveyor/robot-arm-b.glb',
  conveyor: '/models/conveyor/conveyor.glb',
  conveyorLong: '/models/conveyor/conveyor-long.glb',
  boxSmall: '/models/conveyor/box-small.glb',
  boxLarge: '/models/conveyor/box-large.glb',
  scanner: '/models/conveyor/scanner-high.glb',
  structure: '/models/conveyor/structure-medium.glb',
  // Character models
  character: '/models/characters/characterMedium.fbx',
};

// Character skin textures
const SKIN_PATHS = {
  criminal: '/models/characters/criminalMaleA.png',
  cyborg: '/models/characters/cyborgFemaleA.png',
  skaterFemale: '/models/characters/skaterFemaleA.png',
  skaterMale: '/models/characters/skaterMaleA.png',
};

// Preload GLB models
Object.entries(MODEL_PATHS).forEach(([key, path]) => {
  if (path.endsWith('.glb')) {
    useGLTF.preload(path);
  }
});

// Robot Arm Model Component
// Target size from getResourceSize: { width: 0.6, height: 1.8, depth: 0.6 }
export function RobotModel({ color = '#4a90e2', scale = 1, ...props }) {
  const { scene } = useGLTF(MODEL_PATHS.robot);

  const { clonedScene, calculatedScale, yOffset } = useMemo(() => {
    const clone = scene.clone();

    // Calculate original bounding box
    const box = new THREE.Box3().setFromObject(clone);
    const originalSize = new THREE.Vector3();
    box.getSize(originalSize);

    // Target size - fit within this bounding box
    const targetSize = { width: 0.6, height: 1.8, depth: 0.6 };

    // Scale to fit within target (use minimum scale to ensure it fits)
    const scaleX = targetSize.width / originalSize.x;
    const scaleY = targetSize.height / originalSize.y;
    const scaleZ = targetSize.depth / originalSize.z;
    const scaleToFit = Math.min(scaleX, scaleY, scaleZ);

    // Calculate y offset to place bottom at y=0
    const yOffset = -box.min.y * scaleToFit;

    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.color.set(color);
        child.material.metalness = 0.5;
        child.material.roughness = 0.5;
      }
    });
    return { clonedScene: clone, calculatedScale: scaleToFit, yOffset };
  }, [scene, color]);

  return (
    <primitive
      object={clonedScene}
      scale={scale * calculatedScale}
      position={[0, yOffset * scale, 0]}
      {...props}
    />
  );
}

// Conveyor Model Component
// Target size from getResourceSize (machine): { width: 0.8, height: 1.2, depth: 0.8 }
export function ConveyorModel({ color = '#ff6b6b', scale = 1, ...props }) {
  const { scene } = useGLTF(MODEL_PATHS.conveyor);

  const { clonedScene, calculatedScale, yOffset } = useMemo(() => {
    const clone = scene.clone();

    // Calculate original bounding box
    const box = new THREE.Box3().setFromObject(clone);
    const originalSize = new THREE.Vector3();
    box.getSize(originalSize);

    // Target size
    const targetSize = { width: 0.8, height: 1.2, depth: 0.8 };
    const scaleX = targetSize.width / originalSize.x;
    const scaleY = targetSize.height / originalSize.y;
    const scaleZ = targetSize.depth / originalSize.z;
    const scaleToFit = Math.min(scaleX, scaleY, scaleZ);
    const yOffset = -box.min.y * scaleToFit;

    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.metalness = 0.3;
        child.material.roughness = 0.6;
      }
    });
    return { clonedScene: clone, calculatedScale: scaleToFit, yOffset };
  }, [scene, color]);

  return (
    <primitive
      object={clonedScene}
      scale={scale * calculatedScale}
      position={[0, yOffset * scale, 0]}
      {...props}
    />
  );
}

// Box/Material Model Component
// Target size from getResourceSize (material): { width: 0.4, height: 0.25, depth: 0.4 }
export function BoxModel({ color = '#ffa500', scale = 1, variant = 'small', ...props }) {
  const path = variant === 'large' ? MODEL_PATHS.boxLarge : MODEL_PATHS.boxSmall;
  const { scene } = useGLTF(path);

  const { clonedScene, calculatedScale, yOffset } = useMemo(() => {
    const clone = scene.clone();

    // Calculate original bounding box
    const box = new THREE.Box3().setFromObject(clone);
    const originalSize = new THREE.Vector3();
    box.getSize(originalSize);

    // Target size
    const targetSize = { width: 0.4, height: 0.25, depth: 0.4 };
    const scaleX = targetSize.width / originalSize.x;
    const scaleY = targetSize.height / originalSize.y;
    const scaleZ = targetSize.depth / originalSize.z;
    const scaleToFit = Math.min(scaleX, scaleY, scaleZ);
    const yOffset = -box.min.y * scaleToFit;

    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.color.set(color);
        child.material.metalness = 0.1;
        child.material.roughness = 0.8;
      }
    });
    return { clonedScene: clone, calculatedScale: scaleToFit, yOffset };
  }, [scene, color]);

  return (
    <primitive
      object={clonedScene}
      scale={scale * calculatedScale}
      position={[0, yOffset * scale, 0]}
      {...props}
    />
  );
}

// Scanner Model Component (for manual_station)
// Target size from getResourceSize: { width: 0.6, height: 1.0, depth: 0.6 }
export function ScannerModel({ color = '#50c878', scale = 1, ...props }) {
  const { scene } = useGLTF(MODEL_PATHS.scanner);

  const { clonedScene, calculatedScale, yOffset } = useMemo(() => {
    const clone = scene.clone();

    // Calculate original bounding box
    const box = new THREE.Box3().setFromObject(clone);
    const originalSize = new THREE.Vector3();
    box.getSize(originalSize);

    // Target size
    const targetSize = { width: 0.6, height: 1.0, depth: 0.6 };
    const scaleX = targetSize.width / originalSize.x;
    const scaleY = targetSize.height / originalSize.y;
    const scaleZ = targetSize.depth / originalSize.z;
    const scaleToFit = Math.min(scaleX, scaleY, scaleZ);
    const yOffset = -box.min.y * scaleToFit;

    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.metalness = 0.4;
        child.material.roughness = 0.5;
      }
    });
    return { clonedScene: clone, calculatedScale: scaleToFit, yOffset };
  }, [scene, color]);

  return (
    <primitive
      object={clonedScene}
      scale={scale * calculatedScale}
      position={[0, yOffset * scale, 0]}
      {...props}
    />
  );
}

// Structure Model Component (for obstacles like pillars)
export function StructureModel({ color = '#795548', scale = 1, ...props }) {
  const { scene } = useGLTF(MODEL_PATHS.structure);

  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.metalness = 0.2;
        child.material.roughness = 0.7;
      }
    });
    return clone;
  }, [scene, color]);

  return (
    <primitive
      object={clonedScene}
      scale={scale * 1.0}
      {...props}
    />
  );
}

// Generic GLB Model loader
export function GLBModel({ path, color, scale = 1, ...props }) {
  const { scene } = useGLTF(path);

  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    if (color) {
      clone.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.color.set(color);
        }
      });
    }
    return clone;
  }, [scene, color]);

  return (
    <primitive
      object={clonedScene}
      scale={scale}
      {...props}
    />
  );
}

// Worker/Character Model Component using FBX
// Target size from getResourceSize: { width: 0.5, height: 1.6, depth: 0.5 }
export function WorkerModel({ color = '#50c878', scale = 1, skinType = 'skaterMale', highlighted = false, ...props }) {
  const fbx = useFBX(MODEL_PATHS.character);

  // Load skin texture
  const skinPath = SKIN_PATHS[skinType] || SKIN_PATHS.skaterMale;
  const texture = useTexture(skinPath);

  // 목표 크기에 맞게 스케일 계산
  const { clonedScene, finalScale } = useMemo(() => {
    const clone = fbx.clone();

    // 바운딩 박스 계산
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    // 목표 크기
    const targetSize = { width: 0.5, height: 1.6, depth: 0.5 };

    // 각 축별 스케일 계산 후 최소값 사용
    const scaleX = targetSize.width / size.x;
    const scaleY = targetSize.height / size.y;
    const scaleZ = targetSize.depth / size.z;
    const calculatedScale = Math.min(scaleX, scaleY, scaleZ);

    console.log('[WorkerModel] 계산된 스케일:', calculatedScale);

    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          map: texture,
          metalness: 0.1,
          roughness: 0.8,
        });

        if (highlighted) {
          child.material.emissive = new THREE.Color('#ffeb3b');
          child.material.emissiveIntensity = 0.5;
        }
      }
    });

    return { clonedScene: clone, finalScale: calculatedScale };
  }, [fbx, texture, highlighted]);

  return (
    <group scale={[finalScale * scale, finalScale * scale, finalScale * scale]} rotation={[0, Math.PI, 0]} {...props}>
      <primitive object={clonedScene} />
    </group>
  );
}

export default {
  RobotModel,
  ConveyorModel,
  BoxModel,
  ScannerModel,
  StructureModel,
  GLBModel,
  WorkerModel,
  MODEL_PATHS,
  SKIN_PATHS,
};
