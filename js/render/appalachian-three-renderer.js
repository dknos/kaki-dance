import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/three-addons/loaders/GLTFLoader.js";
import { OutlineEffect } from "../vendor/three-addons/effects/OutlineEffect.js";
import { blendAuthoredPose, bodyLineFromInput } from "../appalachian/arm-pose-field.js";

const MODEL_URL = new URL("../../assets/models/appalachian/kaki-appalachian-simulator.glb", import.meta.url);
const MANIFEST_URL = new URL("../../assets/models/appalachian/simulator-manifest.json", import.meta.url);
const INTERNAL_WIDTH = 192;
const INTERNAL_HEIGHT = 108;
const MAX_ROOT_WARP = 0.18;

export function selectAppalachianRendererBackend({
  requested = "auto",
  forceWebGL2 = false,
  hasWebGPU = Boolean(globalThis.navigator?.gpu),
  webGPUStable = false,
} = {}) {
  if (forceWebGL2 || requested === "webgl2") {
    return Object.freeze({
      requested,
      actual: "webgl2",
      forced: true,
      reason: "WebGL2 was explicitly forced for deterministic candidate QA.",
    });
  }
  if (requested === "webgpu" || (requested === "auto" && hasWebGPU)) {
    if (hasWebGPU && webGPUStable) {
      return Object.freeze({
        requested,
        actual: "webgpu",
        forced: false,
        reason: "WebGPU passed the project stability gate.",
      });
    }
    return Object.freeze({
      requested,
      actual: "webgl2",
      forced: false,
      reason: hasWebGPU
        ? "WebGPU remains capability-gated until animation and capture parity pass."
        : "WebGPU is unavailable; using the WebGL2 backend.",
    });
  }
  return Object.freeze({
    requested,
    actual: "webgl2",
    forced: false,
    reason: "WebGL2 is the Gate 1 candidate baseline.",
  });
}

export class AppalachianThreeRenderer {
  constructor({
    width = INTERNAL_WIDTH,
    height = INTERNAL_HEIGHT,
    requestedBackend = rendererQueryValue(),
    forceWebGL2 = rendererQueryValue() === "webgl2",
  } = {}) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = "appalachian-live-canvas";
    this.backend = selectAppalachianRendererBackend({ requested: requestedBackend, forceWebGL2 });
    this.ready = false;
    this.loading = null;
    this.error = null;
    this.character = "kitty";
    this.style = "flatfoot";
    this.renderMode = "live";
    this.debug = {
      skeleton: false,
      contacts: false,
      centerOfMass: false,
      rootTrail: false,
    };
    this.frameDurations = [];
    this.rootTrail = [];
    this.lastActionId = null;
    this.lastClip = "";
    this.currentAction = null;
    this.previousAction = null;
    this.supportLock = {
      foot: "none",
      target: null,
      actionId: -1,
      drift: 0,
      worldPosition: null,
      localTarget: null,
    };
    this.disposed = false;

    if (this.backend.actual !== "webgl2") {
      this.error = new Error("WebGPU is not enabled for this candidate.");
      return;
    }
    const context = this.canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: true,
      desynchronized: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!context) {
      this.error = new Error("WebGL2 is unavailable.");
      return;
    }
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      context,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.effect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.006,
      defaultColor: [0.01, 0.012, 0.035],
      defaultAlpha: 0.92,
      defaultKeepAlive: true,
    });
    // OutlineEffect copies its own autoClear property onto WebGLRenderer, but
    // current Three.js does not initialize that property. Leaving it undefined
    // disables the WebGL clear and turns every animated pose into a permanent
    // trail on the transparent compositor canvas.
    this.effect.autoClear = true;
    this.configureScene(width / height);
  }

  configureScene(aspect) {
    this.scene = new THREE.Scene();
    const halfHeight = 6.45;
    this.camera = new THREE.OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      0.1,
      80,
    );
    this.camera.position.set(7.4, 7.6, 11.6);
    this.camera.lookAt(0, 2.45, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff2d4, 0x25385d, 2.15));
    const key = new THREE.DirectionalLight(0xffe0a2, 4.2);
    key.position.set(-4, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x70cbd0, 2.1);
    rim.position.set(6, 5, -5);
    this.scene.add(rim);

    this.dancerRoot = new THREE.Group();
    this.ikRoot = new THREE.Group();
    this.dancerRoot.add(this.ikRoot);
    this.scene.add(this.dancerRoot);

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x10101c,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.contactShadow = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32), shadowMaterial);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.012;
    this.scene.add(this.contactShadow);

    this.contactMarkers = {
      left: marker(0x4be0b4),
      right: marker(0xf0744b),
      center: marker(0xf1c86b, 0.07),
    };
    Object.values(this.contactMarkers).forEach((value) => {
      value.visible = false;
      this.scene.add(value);
    });
    const rootGeometry = new THREE.BufferGeometry();
    rootGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Array(180 * 3).fill(0), 3));
    this.rootTrailLine = new THREE.Line(
      rootGeometry,
      new THREE.LineBasicMaterial({ color: 0xecc768, transparent: true, opacity: 0.75 }),
    );
    this.rootTrailLine.visible = false;
    this.scene.add(this.rootTrailLine);
  }

  async load(character = "kitty", style = "flatfoot") {
    if (this.disposed) return this;
    this.character = normalizeCharacter(character);
    this.style = normalizeStyle(style);
    if (this.ready) {
      this.setCharacter(this.character);
      return this;
    }
    if (this.loading) return this.loading;
    if (!this.renderer) return this;
    this.loading = Promise.all([
      new GLTFLoader().loadAsync(MODEL_URL.href),
      fetch(MANIFEST_URL).then((response) => {
        if (!response.ok) throw new Error(`Simulator manifest failed: ${response.status}`);
        return response.json();
      }),
    ]).then(([gltf, manifest]) => {
      if (this.disposed) return this;
      this.manifest = manifest;
      this.model = gltf.scene;
      this.animations = gltf.animations;
      this.ikRoot.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      this.actions = new Map();
      for (const clip of gltf.animations) {
        const id = clip.name.replace(/^FrolicCandidate\./, "");
        this.actions.set(id, this.mixer.clipAction(clip));
      }
      this.bones = new Map();
      this.skinnedMeshes = [];
      this.model.traverse((object) => {
        if (object.isBone) this.bones.set(object.name, object);
        if (object.isSkinnedMesh) this.skinnedMeshes.push(object);
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
          object.material = toonMaterial(object.material);
        }
      });
      if (!this.skinnedMeshes.length) throw new Error("The live GLB contains no SkinnedMesh.");
      if (!getBone(this.bones, "foot.L") || !getBone(this.bones, "foot.R")) {
        throw new Error("The live GLB is missing paired support feet.");
      }
      this.skeletonHelper = new THREE.SkeletonHelper(this.model);
      this.skeletonHelper.material.depthTest = false;
      this.skeletonHelper.material.transparent = true;
      this.skeletonHelper.material.opacity = 0.78;
      this.skeletonHelper.visible = false;
      this.scene.add(this.skeletonHelper);
      this.setCharacter(this.character);
      this.ready = true;
      this.loading = null;
      return this;
    }).catch((error) => {
      this.error = error;
      this.loading = null;
      return this;
    });
    return this.loading;
  }

  setCharacter(value) {
    this.character = normalizeCharacter(value);
    if (!this.model) return;
    this.model.traverse((object) => {
      const owner = object.userData?.simulatorCharacter;
      if (owner) object.visible = owner === this.character;
    });
  }

  setStyle(value) {
    this.style = normalizeStyle(value);
  }

  setDebug(value = {}) {
    this.debug = { ...this.debug, ...value };
    if (this.skeletonHelper) this.skeletonHelper.visible = Boolean(this.debug.skeleton);
    this.rootTrailLine.visible = Boolean(this.debug.rootTrail);
  }

  render(snapshot) {
    if (!this.ready || !(snapshot?.dancer ?? snapshot)?.worldPosition || this.disposed) return false;
    const started = performance.now();
    this.setCharacter(snapshot.character?.id ?? snapshot.character?.profileId ?? this.character);
    this.setStyle(snapshot.frolic?.style ?? this.style);
    const dancer = snapshot.dancer ?? snapshot;
    this.ikRoot.position.set(0, 0, 0);
    this.dancerRoot.position.set(
      Number(dancer.worldPosition.x) || 0,
      Number(dancer.worldPosition.y) || 0,
      Number(dancer.worldPosition.z) || 0,
    );
    this.dancerRoot.rotation.y = Number(dancer.facing) || 0;
    this.contactShadow.position.set(
      Number(dancer.worldPosition.x) || 0,
      0.012,
      Number(dancer.worldPosition.z) || 0,
    );
    const height = Number(dancer.worldPosition.y) || 0;
    this.contactShadow.scale.setScalar(clamp(1 - height * 0.28, 0.62, 1));
    this.contactShadow.material.opacity = clamp(0.36 - height * 0.16, 0.12, 0.36);
    this.applyAnimation(dancer);
    this.applyUpperBody(dancer);
    this.applyCostumeMotion(dancer);
    this.model.updateMatrixWorld(true);
    this.applyContactLock(dancer);
    this.updateDiagnostics(dancer);
    // Keep this explicit as a guard against effect/backend changes. The live
    // canvas is composited over the Canvas 2D stage and must contain one pose,
    // never an accumulation of prior transparent frames.
    this.renderer.clear(true, true, true);
    this.effect.render(this.scene, this.camera);
    this.frameDurations.push(performance.now() - started);
    if (this.frameDurations.length > 600) this.frameDurations.splice(0, 120);
    return true;
  }

  applyAnimation(dancer) {
    const clipId = this.actions.has(dancer.presentationClip) ? dancer.presentationClip : "walkingStep";
    const action = this.actions.get(clipId);
    if (!action) return;
    if (clipId !== this.lastClip) {
      this.previousAction = this.currentAction;
      this.currentAction = action;
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(0);
      action.play();
      this.lastClip = clipId;
    }
    const duration = Math.max(1 / 30, action.getClip().duration);
    action.time = clamp(Number(dancer.presentationPhase) || 0, 0, 1) * duration;
    const previousWeight = clamp(Number(dancer.layers?.inertialRecovery) || 0, 0, 1);
    if (this.previousAction && this.previousAction !== action) {
      this.previousAction.enabled = previousWeight > 0.002;
      this.previousAction.setEffectiveWeight(previousWeight);
      this.previousAction.setEffectiveTimeScale(0);
    }
    action.setEffectiveWeight(1 - previousWeight * 0.5);
    this.mixer.update(0);
    if (this.previousAction && previousWeight <= 0.002) {
      this.previousAction.stop();
      this.previousAction = null;
    }
  }

  applyUpperBody(dancer) {
    const upper = dancer.upperBody;
    const samples = this.manifest?.armPoseField ?? [];
    if (!upper || !samples.length) return;
    const coordinated = blendAuthoredPose(samples, upper.coordinated.x, upper.coordinated.y, this.style);
    const left = upper.leftOverride
      ? blendAuthoredPose(samples, upper.left.x, upper.left.y, this.style).left
      : coordinated.left;
    const right = upper.rightOverride
      ? blendAuthoredPose(samples, upper.right.x, upper.right.y, this.style).right
      : coordinated.right;
    const safety = clamp(Number(upper.safetyWeight) || 0, 0, 1);
    applyBonePose(this.bones, "L", left, safety);
    applyBonePose(this.bones, "R", right, safety);
    addBoneEuler(getBone(this.bones, "chest"), coordinated.chest, safety);
    if (upper.bodyActive) {
      const line = bodyLineFromInput(upper.body.x, upper.body.y, this.style);
      addBoneEuler(getBone(this.bones, "pelvis"), line.pelvisDegrees, safety);
      addBoneEuler(getBone(this.bones, "chest"), line.chestDegrees, safety);
    }
    if (upper.handAccentWeight > 0) {
      const accent = upper.handAccent === "clap"
        ? { left: [10, -8, -28], right: [-10, 8, 28] }
        : { left: [18, -10, -18], right: [-18, 10, 18] };
      addBoneEuler(getBone(this.bones, "upperArm.L"), accent.left, upper.handAccentWeight * safety);
      addBoneEuler(getBone(this.bones, "upperArm.R"), accent.right, upper.handAccentWeight * safety);
    }
  }

  applyCostumeMotion(dancer) {
    const tail = getBone(this.bones, "costume.tail");
    const hood = getBone(this.bones, "costume.hood");
    const angular = clamp(Number(dancer.angularVelocity) || 0, -4, 4);
    if (tail) addBoneEuler(tail, [0, angular * -2.2, angular * -3.4], 0.35);
    if (hood) addBoneEuler(hood, [0, angular * 0.8, angular * 0.6], 0.24);
  }

  applyContactLock(dancer) {
    const support = dancer.supportingFoot;
    if (!["left", "right"].includes(support) || dancer.jump?.state === "airborne") {
      this.supportLock = {
        foot: "none",
        target: null,
        actionId: dancer.actionId,
        drift: 0,
        worldPosition: null,
        localTarget: null,
      };
      this.ikRoot.position.x *= 0.82;
      this.ikRoot.position.y *= 0.82;
      this.ikRoot.position.z *= 0.82;
      return;
    }
    const foot = getBone(this.bones, support === "left" ? "foot.L" : "foot.R");
    if (!foot) return;
    const current = new THREE.Vector3();
    foot.getWorldPosition(current);
    const worldPosition = new THREE.Vector3(
      Number(dancer.worldPosition?.x) || 0,
      Number(dancer.worldPosition?.y) || 0,
      Number(dancer.worldPosition?.z) || 0,
    );
    if (this.supportLock.foot !== support || this.supportLock.actionId !== dancer.actionId || !this.supportLock.target) {
      this.supportLock = {
        foot: support,
        target: current.clone(),
        actionId: dancer.actionId,
        drift: 0,
        worldPosition,
        localTarget: this.dancerRoot.worldToLocal(current.clone()),
      };
      return;
    }
    this.supportLock.target = this.dancerRoot.localToWorld(this.supportLock.localTarget.clone());
    this.supportLock.worldPosition = worldPosition;
    const difference = this.supportLock.target.clone().sub(current);
    if (difference.length() > MAX_ROOT_WARP) {
      // The authored foot has crossed its release threshold. Treat this as a
      // new support contact instead of dragging the old plant through a step.
      this.supportLock.target = current.clone();
      this.supportLock.localTarget = this.dancerRoot.worldToLocal(current.clone());
      this.supportLock.drift = 0;
      return;
    }
    const planarDistance = Math.hypot(difference.x, difference.z);
    const correctionScale = planarDistance > MAX_ROOT_WARP ? MAX_ROOT_WARP / planarDistance : 1;
    const worldCorrection = new THREE.Vector3(
      difference.x * correctionScale,
      difference.y * Math.min(1, MAX_ROOT_WARP / Math.max(1e-6, Math.abs(difference.y))),
      difference.z * correctionScale,
    );
    const dancerRotation = new THREE.Quaternion();
    this.dancerRoot.getWorldQuaternion(dancerRotation);
    this.ikRoot.position.add(worldCorrection.applyQuaternion(dancerRotation.invert()));
    this.model.updateMatrixWorld(true);
    foot.getWorldPosition(current);
    this.supportLock.drift = Math.hypot(
      current.x - this.supportLock.target.x,
      current.y - this.supportLock.target.y,
      current.z - this.supportLock.target.z,
    );
  }

  updateDiagnostics(dancer) {
    this.skeletonHelper.visible = Boolean(this.debug.skeleton);
    for (const [side, boneName] of [["left", "foot.L"], ["right", "foot.R"]]) {
      const value = this.contactMarkers[side];
      value.visible = Boolean(this.debug.contacts);
      getBone(this.bones, boneName)?.getWorldPosition(value.position);
    }
    const center = this.contactMarkers.center;
    center.visible = Boolean(this.debug.centerOfMass);
    center.position.set(
      Number(dancer.centerOfMass?.x) || 0,
      Number(dancer.centerOfMass?.y) || 2.7,
      Number(dancer.centerOfMass?.z) || 0,
    );
    const current = dancer.worldPosition;
    const last = this.rootTrail.at(-1);
    if (!last || Math.hypot(current.x - last.x, current.z - last.z) > 0.06) {
      this.rootTrail.push({ x: current.x, y: 0.025, z: current.z });
      if (this.rootTrail.length > 180) this.rootTrail.shift();
      const attribute = this.rootTrailLine.geometry.getAttribute("position");
      for (let index = 0; index < 180; index += 1) {
        const point = this.rootTrail[index] ?? this.rootTrail.at(-1) ?? { x: 0, y: 0, z: 0 };
        attribute.setXYZ(index, point.x, point.y, point.z);
      }
      attribute.needsUpdate = true;
      this.rootTrailLine.geometry.setDrawRange(0, this.rootTrail.length);
    }
    this.rootTrailLine.visible = Boolean(this.debug.rootTrail);
  }

  getDiagnostics() {
    const sorted = [...this.frameDurations].sort((left, right) => left - right);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    return Object.freeze({
      ready: this.ready,
      error: this.error?.message ?? "",
      backend: this.backend,
      internalSize: Object.freeze([this.canvas.width, this.canvas.height]),
      skinnedMeshCount: this.skinnedMeshes?.length ?? 0,
      actionCount: this.actions?.size ?? 0,
      boneCount: this.bones?.size ?? 0,
      boneNames: Object.freeze([...(this.bones?.keys?.() ?? [])]),
      character: this.character,
      style: this.style,
      clip: this.lastClip,
      supportFoot: this.supportLock.foot,
      plantedFootDriftMeters: this.supportLock.drift,
      renderP95Milliseconds: p95,
      tailSupportEligible: false,
      candidateStatus: this.manifest?.candidateStatus ?? "CANDIDATE — HUMAN REVIEW REQUIRED",
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.model?.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((value) => value.dispose?.());
      else object.material?.dispose?.();
    });
    this.contactShadow?.geometry.dispose();
    this.contactShadow?.material.dispose();
    this.rootTrailLine?.geometry.dispose();
    this.rootTrailLine?.material.dispose();
    this.renderer?.dispose();
    this.ready = false;
  }
}

function toonMaterial(source) {
  const input = Array.isArray(source) ? source[0] : source;
  return new THREE.MeshToonMaterial({
    name: `${input?.name ?? "Kaki"} Toon`,
    color: input?.color?.clone?.() ?? new THREE.Color(0xf2cfaa),
    map: input?.map ?? null,
    transparent: Boolean(input?.transparent),
    opacity: Number.isFinite(input?.opacity) ? input.opacity : 1,
    side: input?.side ?? THREE.FrontSide,
    vertexColors: Boolean(input?.vertexColors),
  });
}

function applyBonePose(bones, side, pose, weight) {
  addBoneEuler(getBone(bones, `upperArm.${side}`), pose.upperArm, weight);
  addBoneEuler(getBone(bones, `forearm.${side}`), pose.forearm, weight);
  addBoneEuler(getBone(bones, `hand.${side}`), pose.hand, weight);
}

function getBone(bones, name) {
  return bones.get(name) ?? bones.get(String(name).replaceAll(".", ""));
}

function addBoneEuler(bone, degrees, weight = 1) {
  if (!bone || !degrees) return;
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad((Number(degrees[0]) || 0) * weight),
    THREE.MathUtils.degToRad((Number(degrees[1]) || 0) * weight),
    THREE.MathUtils.degToRad((Number(degrees[2]) || 0) * weight),
    "XYZ",
  );
  bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(euler)).normalize();
}

function marker(color, radius = 0.055) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 8, 6),
    new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }),
  );
}

function normalizeCharacter(value) {
  return value === "soder" || value === "soter" ? "soder" : "kitty";
}

function normalizeStyle(value) {
  return ["flatfoot", "buck", "clog"].includes(value) ? value : "flatfoot";
}

function rendererQueryValue() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("renderer") ?? "auto";
  } catch {
    return "auto";
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}
