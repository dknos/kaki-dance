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
      footBasis: false,
    };
    this.frameDurations = [];
    this.rootTrail = [];
    this.lastActionId = null;
    this.lastClip = "";
    this.currentAction = null;
    this.previousAction = null;
    this.footLayerActions = new Map();
    this.activeFootLayerKeys = new Set();
    this.footBasis = null;
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
      this.buildFootLayerActions();
      this.buildFootBasisDiagnostics();
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
    this.setFootBasisVisibility(Boolean(this.debug.footBasis));
  }

  setCameraPreset(value = "gameplay") {
    const preset = {
      front: [0, 3.1, 14],
      side: [14, 3.1, 0],
      gameplay: [7.4, 7.6, 11.6],
    }[value] ?? [7.4, 7.6, 11.6];
    this.camera.position.set(...preset);
    this.camera.lookAt(0, 2.45, 0);
    this.camera.updateProjectionMatrix();
    return ["front", "side", "gameplay"].includes(value) ? value : "gameplay";
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
    this.applyFootLayers(dancer);
    this.mixer.update(0);
    if (this.previousAction && previousWeight <= 0.002) {
      this.previousAction.stop();
      this.previousAction = null;
    }
  }

  buildFootLayerActions() {
    for (const clip of this.animations ?? []) {
      const id = clip.name.replace(/^FrolicCandidate\./, "");
      if (!id.startsWith("gesture")) continue;
      for (const side of ["left", "right"]) {
        const suffix = side === "left" ? "L" : "R";
        const trackNames = [`thigh${suffix}.`, `shin${suffix}.`, `foot${suffix}.`, `toe${suffix}.`];
        const tracks = clip.tracks
          .filter((track) => trackNames.some((name) => track.name.startsWith(name)))
          .map((track) => track.clone());
        if (!tracks.length) continue;
        const layerClip = new THREE.AnimationClip(
          `FootLayer.${id}.${side}`,
          clip.duration,
          tracks,
        );
        THREE.AnimationUtils.makeClipAdditive(layerClip, 0, layerClip, 30);
        const action = this.mixer.clipAction(layerClip);
        action.blendMode = THREE.AdditiveAnimationBlendMode;
        action.enabled = false;
        action.setEffectiveTimeScale(0);
        action.play();
        this.footLayerActions.set(`${id}:${side}`, action);
      }
    }
  }

  applyFootLayers(dancer) {
    const next = new Set();
    for (const layer of dancer.footLayers ?? []) {
      if (!(layer.phase > 0.001) && layer.stage === "planted") continue;
      const clipId = layer.clipId || (layer.side === "left" ? "gesturePulseLeft" : "gesturePulseRight");
      const key = `${clipId}:${layer.side}`;
      const action = this.footLayerActions.get(key);
      if (!action) continue;
      const duration = Math.max(1 / 30, action.getClip().duration);
      action.time = clamp(layer.phase, 0, 1) * duration;
      action.enabled = true;
      const envelope = layer.stage === "anticipation"
        ? clamp(layer.phase * 3.4, 0.16, 0.62)
        : layer.phase > 0.82
          ? clamp((1 - layer.phase) / 0.18, 0, 1)
          : 1;
      action.setEffectiveWeight(envelope);
      action.setEffectiveTimeScale(0);
      next.add(key);
    }
    for (const key of this.activeFootLayerKeys) {
      if (next.has(key)) continue;
      const action = this.footLayerActions.get(key);
      if (action) {
        action.enabled = false;
        action.setEffectiveWeight(0);
      }
    }
    this.activeFootLayerKeys = next;
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
    const lean = dancer.bodyLean ?? {};
    const styleScale = { flatfoot: 0.62, buck: 0.82, clog: 1 }[this.style];
    addBoneEuler(getBone(this.bones, "pelvis"), [
      (Number(lean.forward) || 0) * -3.2,
      (Number(lean.turn) || 0) * 2.2,
      (Number(lean.lateral) || 0) * 4.4,
    ], styleScale * safety);
    addBoneEuler(getBone(this.bones, "chest"), [
      (Number(lean.forward) || 0) * 2.4,
      (Number(lean.turn) || 0) * -3.2,
      (Number(lean.lateral) || 0) * -5.2,
    ], styleScale * safety);
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
    this.updateFootBasisDiagnostics(dancer);
  }

  buildFootBasisDiagnostics() {
    this.footAxes = {};
    this.toeForwardArrows = {};
    this.footLabels = {};
    for (const [side, footName, color] of [
      ["left", "foot.L", 0x4be0b4],
      ["right", "foot.R", 0xf0744b],
    ]) {
      const foot = getBone(this.bones, footName);
      const axes = new THREE.AxesHelper(0.48);
      axes.material.depthTest = false;
      axes.visible = false;
      foot.add(axes);
      this.footAxes[side] = axes;
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(),
        0.72,
        color,
        0.16,
        0.1,
      );
      arrow.visible = false;
      arrow.line.material.depthTest = false;
      arrow.cone.material.depthTest = false;
      this.scene.add(arrow);
      this.toeForwardArrows[side] = arrow;
      const label = diagnosticLabel(side === "left" ? "L" : "R", color);
      label.visible = false;
      this.scene.add(label);
      this.footLabels[side] = label;
    }
    this.rootForwardArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(),
      1.05,
      0xf1c86b,
      0.2,
      0.13,
    );
    this.rootForwardArrow.line.material.depthTest = false;
    this.rootForwardArrow.cone.material.depthTest = false;
    this.rootForwardArrow.visible = false;
    this.scene.add(this.rootForwardArrow);
  }

  setFootBasisVisibility(visible) {
    for (const value of Object.values(this.footAxes ?? {})) value.visible = visible;
    for (const value of Object.values(this.toeForwardArrows ?? {})) value.visible = visible;
    for (const value of Object.values(this.footLabels ?? {})) value.visible = visible;
    if (this.rootForwardArrow) this.rootForwardArrow.visible = visible;
  }

  updateFootBasisDiagnostics(dancer) {
    if (!this.toeForwardArrows) return;
    const intended = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.dancerRoot.getWorldQuaternion(new THREE.Quaternion()))
      .setY(0)
      .normalize();
    const values = {};
    for (const [side, toeName] of [["left", "toe.L"], ["right", "toe.R"]]) {
      const toe = getBone(this.bones, toeName);
      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3(0, 1, 0);
      toe.getWorldPosition(origin);
      direction.applyQuaternion(toe.getWorldQuaternion(new THREE.Quaternion()));
      const planar = direction.clone().setY(0);
      if (planar.lengthSq() > 1e-8) planar.normalize();
      const arrow = this.toeForwardArrows[side];
      arrow.position.copy(origin);
      if (planar.lengthSq() > 1e-8) arrow.setDirection(planar);
      const label = this.footLabels[side];
      label.position.copy(origin).add(new THREE.Vector3(0, 0.42, 0));
      values[side] = Object.freeze({
        vector: Object.freeze(planar.toArray()),
        dot: planar.dot(intended),
        contact: dancer.feet?.[side]?.contact ?? "flat",
        support: dancer.supportingFoot === side,
      });
    }
    this.rootForwardArrow.position.set(
      Number(dancer.worldPosition?.x) || 0,
      0.08,
      Number(dancer.worldPosition?.z) || 0,
    );
    this.rootForwardArrow.setDirection(intended);
    this.footBasis = Object.freeze({
      intendedForward: Object.freeze(intended.toArray()),
      facingRadians: Number(dancer.facing) || 0,
      left: values.left,
      right: values.right,
      minimumDot: Math.min(values.left.dot, values.right.dot),
    });
    this.setFootBasisVisibility(Boolean(this.debug.footBasis));
  }

  validateExportedFootBasis() {
    if (!this.ready || !this.mixer || !this.manifest) {
      return Object.freeze({ ok: false, reason: "renderer-not-ready", actions: Object.freeze({}) });
    }
    const minimumAllowed = Number(this.manifest.footBasis?.plantedToeForwardDotMin) || 0.78;
    const intended = new THREE.Vector3(0, 0, 1);
    const actionResults = {};
    let minimumDot = 1;
    let sampledVectors = 0;
    let explicitOptOutFrames = 0;

    this.mixer.stopAllAction();
    for (const action of this.footLayerActions.values()) {
      action.enabled = false;
      action.setEffectiveWeight(0);
    }
    this.activeFootLayerKeys.clear();

    for (const [clipId, metadata] of Object.entries(this.manifest.actions ?? {})) {
      const action = this.actions.get(clipId);
      if (!action) continue;
      const [firstFrame, lastFrame] = metadata.frameRange ?? [1, 1];
      const excluded = new Set(
        (metadata.toeForwardExemptions ?? []).map((value) => Number(value.frame)),
      );
      explicitOptOutFrames += excluded.size;
      let actionMinimum = 1;
      let actionSamples = 0;
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(0);
      action.play();
      for (let frame = firstFrame; frame <= lastFrame; frame += 1) {
        if (excluded.has(frame)) continue;
        const denominator = Math.max(1, lastFrame - firstFrame);
        action.time = ((frame - firstFrame) / denominator) * action.getClip().duration;
        this.mixer.update(0);
        this.model.updateMatrixWorld(true);
        for (const name of ["foot.L", "toe.L", "foot.R", "toe.R"]) {
          const bone = getBone(this.bones, name);
          const direction = new THREE.Vector3(0, 1, 0)
            .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()))
            .setY(0);
          if (direction.lengthSq() <= 1e-8) continue;
          const dot = direction.normalize().dot(intended);
          actionMinimum = Math.min(actionMinimum, dot);
          minimumDot = Math.min(minimumDot, dot);
          actionSamples += 1;
          sampledVectors += 1;
        }
      }
      action.stop();
      actionResults[clipId] = Object.freeze({
        sampledVectors: actionSamples,
        minimumDot: actionMinimum,
        explicitOptOutFrames: excluded.size,
        passed: actionMinimum >= minimumAllowed,
      });
    }

    this.lastClip = "";
    this.currentAction = null;
    this.previousAction = null;
    const failedActions = Object.entries(actionResults)
      .filter(([, value]) => !value.passed)
      .map(([clipId]) => clipId);
    return Object.freeze({
      ok: sampledVectors > 0 && failedActions.length === 0,
      localForwardAxis: "+Y",
      intendedForward: Object.freeze(intended.toArray()),
      minimumAllowed,
      minimumDot,
      sampledVectors,
      explicitOptOutFrames,
      failedActions: Object.freeze(failedActions),
      actions: Object.freeze(actionResults),
    });
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
      footLayerActionCount: this.footLayerActions?.size ?? 0,
      boneCount: this.bones?.size ?? 0,
      boneNames: Object.freeze([...(this.bones?.keys?.() ?? [])]),
      character: this.character,
      style: this.style,
      clip: this.lastClip,
      supportFoot: this.supportLock.foot,
      plantedFootDriftMeters: this.supportLock.drift,
      footBasis: this.footBasis,
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

function diagnosticLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, 64, 64);
  context.fillStyle = "#08141d";
  context.beginPath();
  context.arc(32, 32, 25, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = `#${new THREE.Color(color).getHexString()}`;
  context.stroke();
  context.font = "bold 32px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff6d8";
  context.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  }));
  sprite.scale.set(0.48, 0.48, 0.48);
  return sprite;
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
