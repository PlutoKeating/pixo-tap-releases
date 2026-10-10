import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { applyCameraLensTexture } from './product-camera-lens.mjs?v=20260811-1';
import {
  getHeroSceneState,
  getLaptopHandoffState,
  getProduct3DState,
  rangeProgress,
  smoothstep
} from './product-3d-progress.mjs?v=20260810-4';

const FRONT_ROTATION_Y = 0;
const PRODUCT_PHASE_END = 0.68;
const LAPTOP_PHASE_START = 0.66;
const FEATURE_WINDOWS = [
  [0.47, 0.51, 0.56, 0.60],
  [0.59, 0.63, 0.69, 0.73],
  [0.72, 0.76, 0.84, 0.88]
];

function featureOpacity(progress, [enterStart, enterEnd, exitStart, exitEnd]) {
  const enter = smoothstep(rangeProgress(progress, enterStart, enterEnd));
  const exit = 1 - smoothstep(rangeProgress(progress, exitStart, exitEnd));
  return Math.min(enter, exit);
}

function disposeModel(model) {
  model?.traverse(object => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach(material => {
      Object.values(material).forEach(value => value?.isTexture && value.dispose());
      material.dispose?.();
    });
  });
}

function loadModel(loader, source) {
  return new Promise((resolve, reject) => loader.load(source, resolve, undefined, reject));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

export function initHeroSceneInteraction(rootElement) {
  const root = rootElement;
  const baseScene = root?.querySelector('.hero-scene-base');
  const focusScene = root?.querySelector('.hero-scene-focus');
  const vignette = root?.querySelector('.hero-scene-vignette');
  const copy = root?.querySelector('.hero-copy');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!root || !baseScene || !focusScene || !vignette || !copy) {
    throw new Error('PIXO hero scene markup is incomplete.');
  }

  let scrollTween;
  let fallbackFrame = 0;
  let destroyed = false;

  function handleSceneError() {
    root.classList.add('has-hero-scene-error');
    root.dataset.heroSceneError = 'true';
    copy.style.opacity = '1.0000';
    copy.style.transform = 'translate3d(0, 0, 0)';
  }

  function applyProgress(value) {
    const state = getHeroSceneState(reduceMotion ? 0 : value);
    const transform = `translate3d(0, 0, 0) scale(${state.scale.toFixed(4)})`;
    const copyOpacity = root.classList.contains('has-hero-scene-error') ? 1 : state.copyOpacity;
    const copyOffset = 16 * (1 - copyOpacity);

    baseScene.style.transform = transform;
    baseScene.style.filter = `blur(${state.peripheralBlurPx.toFixed(2)}px)`;
    focusScene.style.transform = transform;
    focusScene.style.filter = 'none';
    focusScene.style.opacity = state.focusOpacity.toFixed(4);
    copy.style.opacity = copyOpacity.toFixed(4);
    copy.style.transform = `translate3d(0, ${copyOffset.toFixed(2)}px, 0)`;
    vignette.style.opacity = state.vignetteOpacity.toFixed(4);
    root.dataset.heroProgress = state.progress.toFixed(4);
  }

  function updateFallbackScroll() {
    fallbackFrame = 0;
    const rect = root.getBoundingClientRect();
    const travel = Math.max(1, root.offsetHeight - window.innerHeight);
    applyProgress(-rect.top / travel);
  }

  function requestFallbackScrollUpdate() {
    if (!destroyed && !fallbackFrame) {
      fallbackFrame = window.requestAnimationFrame(updateFallbackScroll);
    }
  }

  baseScene.addEventListener('error', handleSceneError);
  focusScene.addEventListener('error', handleSceneError);
  if (baseScene.complete && baseScene.naturalWidth === 0) handleSceneError();
  if (focusScene.complete && focusScene.naturalWidth === 0) handleSceneError();

  if (reduceMotion) {
    applyProgress(0);
  } else if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    const scrollState = { progress: 0 };
    scrollTween = window.gsap.to(scrollState, {
      progress: 1,
      ease: 'none',
      scrollTrigger: {
        id: 'pixo-hero-scene',
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.9,
        invalidateOnRefresh: true
      },
      onUpdate: () => applyProgress(scrollState.progress)
    });
  } else {
    window.addEventListener('scroll', requestFallbackScrollUpdate, { passive: true });
    updateFallbackScroll();
  }

  function destroy() {
    destroyed = true;
    scrollTween?.kill();
    window.removeEventListener('scroll', requestFallbackScrollUpdate);
    if (fallbackFrame) window.cancelAnimationFrame(fallbackFrame);
    baseScene.removeEventListener('error', handleSceneError);
    focusScene.removeEventListener('error', handleSceneError);
  }

  return { applyProgress, destroy };
}

const heroSceneRoot = document.getElementById('top');
if (heroSceneRoot) {
  window.__pixoHeroScene = initHeroSceneInteraction(heroSceneRoot);
  window.__pixoHeroSceneReady = Promise.resolve(window.__pixoHeroScene);
}

export async function initProduct3DInteraction(rootElement) {
  const root = rootElement;
  const stage = root?.querySelector('.product-webgl-stage');
  const canvas = root?.querySelector('.product-webgl-canvas');
  const peripheralPets = Array.from(root?.querySelectorAll('.product-pet-peripheral') || []);
  const hart = root?.querySelector('.product-hart-2d');
  const features = Array.from(root?.querySelectorAll('.product-feature') || []);
  const handoffScene = root?.querySelector('.product-handoff-scene');
  const laptopHandoff = root?.querySelector('#product-laptop-handoff');
  const heading = root?.querySelector('.product-overview-heading');
  const progressRail = root?.querySelector('.product-progress');
  const progressFill = root?.querySelector('.product-progress span');
  const scrollHint = root?.querySelector('.product-scroll-hint');
  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = reduceMotionQuery.matches;

  if (!root || !stage || !canvas || !hart || !handoffScene || !laptopHandoff) {
    throw new Error('PIXO product 3D markup is incomplete.');
  }

  let renderer;
  let model;
  let scrollTween;
  let fallbackFrame = 0;
  let stageIsVisible = true;
  let destroyed = false;
  let sceneHasError = false;
  let appliedProgress = 0;
  let sceneRecoveryFrame = 0;
  let handoffTarget = { xVw: -26.4, yVh: -39.2, scale: 0.48, pathScale: 1 };
  const laptopController = initLaptopHandoffInteraction(laptopHandoff, {
    controlled: true,
    sourceScene: handoffScene
  });
  window.__pixoLaptopHandoff = laptopController;
  window.__pixoLaptopHandoffReady = Promise.resolve(laptopController);

  function readHandoffTarget() {
    const styles = window.getComputedStyle(root);
    const readNumber = (property, fallback) => {
      const value = Number.parseFloat(styles.getPropertyValue(property));
      return Number.isFinite(value) ? value : fallback;
    };
    handoffTarget = {
      xVw: readNumber('--handoff-target-x-vw', -26.4),
      yVh: readNumber('--handoff-target-y-vh', -39.2),
      scale: readNumber('--handoff-target-scale', 0.48),
      pathScale: readNumber('--model-path-scale', 1)
    };
  }

  function handleSceneError() {
    sceneHasError = true;
    root.classList.add('has-scene-error');
    root.dataset.sceneError = 'true';
    if (!sceneRecoveryFrame) {
      sceneRecoveryFrame = window.requestAnimationFrame(() => {
        sceneRecoveryFrame = 0;
        if (!destroyed) applyProgress(appliedProgress);
      });
    }
  }

  readHandoffTarget();
  handoffScene?.addEventListener('error', handleSceneError);
  if (handoffScene?.complete && handoffScene.naturalWidth === 0) handleSceneError();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0, 7.4);
  camera.lookAt(0, 0, 0);

  const pivot = new THREE.Group();
  scene.add(pivot);

  scene.add(new THREE.HemisphereLight(0xfff8e9, 0x55342f, 2.1));
  const keyLight = new THREE.DirectionalLight(0xfff2dd, 3.4);
  keyLight.position.set(4.5, 6, 7);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffb7a8, 1.25);
  fillLight.position.set(-4, 1.5, 4);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xc7dcff, 1.4);
  rimLight.position.set(-4, 3.5, -5);
  scene.add(rimLight);

  function render(force = false) {
    if (!renderer || !model || destroyed || (!stageIsVisible && !force)) return;
    renderer.render(scene, camera);
  }

  function resize() {
    readHandoffTarget();
    if (!renderer || destroyed) return;
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render(true);
  }

  function applyProgress(value) {
    const overallProgress = rangeProgress(value, 0, 1);
    appliedProgress = overallProgress;
    const overviewProgress = rangeProgress(overallProgress, 0, PRODUCT_PHASE_END);
    const laptopProgress = rangeProgress(overallProgress, LAPTOP_PHASE_START, 1);
    const state = getProduct3DState(reduceMotion ? 0.88 : overviewProgress);
    const peripheralTransform = `translate3d(0, 0, 0) scale(${state.peripheralScale.toFixed(4)})`;
    const touringModelX = state.modelXvw * handoffTarget.pathScale;
    const modelX = reduceMotion ? 0 : lerp(touringModelX, handoffTarget.xVw, state.handoffProgress);
    const modelY = reduceMotion ? 0 : lerp(state.modelYvh, handoffTarget.yVh, state.handoffProgress);
    const modelScale = reduceMotion ? 1 : lerp(state.modelScale, handoffTarget.scale, state.handoffProgress);
    const modelOpacity = reduceMotion
      ? 1
      : state.modelOpacity * (sceneHasError ? 1 : state.modelTakeoverOpacity);

    peripheralPets.forEach(pet => {
      pet.style.opacity = state.peripheralOpacity.toFixed(4);
      pet.style.transform = peripheralTransform;
      pet.style.filter = `blur(${state.peripheralBlur.toFixed(2)}px) drop-shadow(0 22px 28px rgba(62,55,40,.18))`;
    });

    hart.style.opacity = state.hartOpacity.toFixed(4);
    hart.style.transform = `translate3d(0, 0, 0) scale(${state.hartScale.toFixed(4)})`;
    hart.style.filter = `blur(${state.hartBlur.toFixed(2)}px) drop-shadow(0 26px 34px rgba(62,55,40,.22))`;

    stage.style.opacity = modelOpacity.toFixed(4);
    stage.style.setProperty('--model-x', `${modelX.toFixed(3)}vw`);
    stage.style.setProperty('--model-y', `${modelY.toFixed(3)}vh`);
    stage.style.setProperty('--model-scale', modelScale.toFixed(4));

    if (handoffScene) {
      const sceneOpacity = reduceMotion ? 1 : (sceneHasError ? 0 : state.sceneOpacity);
      const sceneBlurPx = reduceMotion ? 0 : state.sceneBlurPx;
      const sceneScale = reduceMotion ? 1 : state.sceneScale;
      laptopController.applyProgress(laptopProgress, {
        sourceBaseOpacity: sceneOpacity,
        sourceBaseBlurPx: sceneBlurPx,
        sourceBaseScale: sceneScale
      });
    }

    const headingOpacity = reduceMotion ? 1 : state.headingOpacity;
    const chromeOpacity = reduceMotion ? 1 : state.chromeOpacity;
    if (heading) heading.style.opacity = headingOpacity.toFixed(4);
    if (progressRail) progressRail.style.opacity = chromeOpacity.toFixed(4);

    pivot.rotation.y = FRONT_ROTATION_Y + state.modelRotationY;
    root.dataset.productProgress = overallProgress.toFixed(4);
    root.dataset.overviewProgress = state.progress.toFixed(4);
    root.dataset.handoffProgress = state.handoffProgress.toFixed(4);
    root.dataset.activeStep = String(state.featureStep);
    stage.dataset.rotationY = state.modelRotationY.toFixed(6);
    stage.dataset.modelX = modelX.toFixed(3);
    stage.dataset.modelY = modelY.toFixed(3);
    stage.dataset.modelScale = modelScale.toFixed(4);
    progressFill?.style.setProperty('transform', `scaleY(${state.progress.toFixed(4)})`);

    features.forEach((feature, index) => {
      const opacity = reduceMotion ? 1 : featureOpacity(state.progress, FEATURE_WINDOWS[index]);
      const isActive = reduceMotion || index === state.featureStep;
      feature.style.opacity = opacity.toFixed(4);
      feature.style.visibility = opacity > 0.015 ? 'visible' : 'hidden';
      feature.style.transform = `translate3d(0, ${((1 - opacity) * 24).toFixed(2)}px, 0)`;
      feature.dataset.active = isActive ? 'true' : 'false';
      feature.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    if (scrollHint) {
      scrollHint.style.opacity = (1 - smoothstep(rangeProgress(state.progress, 0.07, 0.17))).toFixed(4);
    }
    render();
  }

  function updateFallbackScroll() {
    fallbackFrame = 0;
    const rect = root.getBoundingClientRect();
    const travel = Math.max(1, root.offsetHeight - window.innerHeight);
    applyProgress(-rect.top / travel);
  }

  function requestFallbackScrollUpdate() {
    if (!fallbackFrame) fallbackFrame = window.requestAnimationFrame(updateFallbackScroll);
  }

  const visibilityObserver = new IntersectionObserver(entries => {
    stageIsVisible = entries.some(entry => entry.isIntersecting);
    if (stageIsVisible) render(true);
  }, { rootMargin: '20% 0px', threshold: 0 });
  visibilityObserver.observe(root);

  function setupScrollControl() {
    if (reduceMotion) {
      applyProgress(0.88);
      return;
    }

    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      const scrollState = { progress: 0 };
      scrollTween = window.gsap.to(scrollState, {
        progress: 1,
        ease: 'none',
        scrollTrigger: {
          id: 'product-overview-3d',
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.7,
          invalidateOnRefresh: true,
          onRefresh: requestFallbackScrollUpdate
        },
        onUpdate: () => applyProgress(scrollState.progress)
      });
      document.fonts?.ready.then(() => window.ScrollTrigger.refresh());
    } else {
      window.addEventListener('scroll', requestFallbackScrollUpdate, { passive: true });
    }
    updateFallbackScroll();
  }

  function destroy() {
    destroyed = true;
    scrollTween?.kill();
    visibilityObserver.disconnect();
    window.removeEventListener('scroll', requestFallbackScrollUpdate);
    window.removeEventListener('resize', resize);
    handoffScene?.removeEventListener('error', handleSceneError);
    laptopController.destroy();
    if (sceneRecoveryFrame) window.cancelAnimationFrame(sceneRecoveryFrame);
    disposeModel(model);
    if (renderer) renderer.dispose();
  }

  const controller = { applyProgress, resize, destroy };
  setupScrollControl();
  applyProgress(0);

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const loader = new GLTFLoader();
    const source = new URL(stage.dataset.modelSrc, document.baseURI).href;
    const gltf = await loadModel(loader, source);
    model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const normalizedScale = 3.2 / maxAxis;
    model.scale.setScalar(normalizedScale);
    model.position.copy(center).multiplyScalar(-normalizedScale);
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.material?.forEach?.(material => { material.needsUpdate = true; });
      if (object.material && !Array.isArray(object.material)) object.material.needsUpdate = true;
    });
    const cameraLens = applyCameraLensTexture(THREE, model);
    stage.dataset.cameraLens = cameraLens ? 'ready' : 'missing';
    pivot.add(model);
    stage.classList.add('has-model');
    resize();
    render(true);
  } catch (error) {
    stage.classList.add('has-model-error');
    root.dataset.modelError = 'true';
    console.warn('PIXO TAP 3D model fallback active.', error);
  }

  window.addEventListener('resize', resize, { passive: true });
  return controller;
}

const productOverview = document.getElementById('product-overview');
if (productOverview) {
  window.__pixoProduct3DReady = initProduct3DInteraction(productOverview).then(controller => {
    window.__pixoProduct3D = controller;
    return controller;
  });
}

export function initLaptopHandoffInteraction(rootElement, options = {}) {
  const root = rootElement;
  const sourceScene = options.sourceScene || root?.querySelector('.product-laptop-source-scene');
  const laptopStage = root?.querySelector('.product-laptop-stage');
  const laptopImage = root?.querySelector('.product-laptop-photo');
  const video = root?.querySelector('#productLaptopVideo');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const controlled = Boolean(options.controlled);
  if (!root || !sourceScene || !laptopStage || !laptopImage || !video) {
    throw new Error('PIXO laptop handoff markup is incomplete.');
  }

  let scrollTween;
  let fallbackFrame = 0;
  let currentState = getLaptopHandoffState(0);
  let playCycleStarted = false;
  let sectionIsVisible = false;
  let resetOnMetadata = false;
  let laptopImageHasError = false;

  function setVideoToStart() {
    if (video.readyState >= 1) {
      video.currentTime = 0;
      resetOnMetadata = false;
    } else {
      resetOnMetadata = true;
    }
  }

  function resetVideo() {
    video.pause();
    setVideoToStart();
    playCycleStarted = false;
    root.dataset.videoState = 'reset';
  }

  function beginVideoCycle() {
    if (!sectionIsVisible || document.hidden || playCycleStarted) return;
    setVideoToStart();
    playCycleStarted = true;
    root.dataset.videoState = 'playing';
    video.play()?.catch(() => { root.dataset.videoState = 'blocked'; });
  }

  function resumeVideo() {
    if (!sectionIsVisible || document.hidden || !playCycleStarted || !video.paused || video.ended) return;
    video.play()?.catch(() => { root.dataset.videoState = 'blocked'; });
  }

  function applyProgress(value, sourceState = {}) {
    currentState = getLaptopHandoffState(reduceMotion ? 1 : value);
    const sourceBaseOpacity = Number.isFinite(sourceState.sourceBaseOpacity) ? sourceState.sourceBaseOpacity : 1;
    const sourceBaseBlurPx = Number.isFinite(sourceState.sourceBaseBlurPx) ? sourceState.sourceBaseBlurPx : 0;
    const sourceBaseScale = Number.isFinite(sourceState.sourceBaseScale) ? sourceState.sourceBaseScale : 1;
    const sourceOpacity = sourceBaseOpacity * currentState.sourceOpacity;
    const sourceBlurPx = sourceBaseBlurPx + currentState.sourceBlurPx;
    const sourceScale = sourceBaseScale * currentState.sourceScale;
    sourceScene.style.opacity = laptopImageHasError ? '1' : sourceOpacity.toFixed(4);
    sourceScene.style.filter = laptopImageHasError ? 'none' : `blur(${sourceBlurPx.toFixed(2)}px)`;
    sourceScene.style.transform = laptopImageHasError ? 'none' : `translate3d(0, 0, 0) scale(${sourceScale.toFixed(4)})`;
    sourceScene.dataset.sceneOpacity = sourceScene.style.opacity;
    laptopStage.style.opacity = laptopImageHasError ? '0' : currentState.laptopOpacity.toFixed(4);
    laptopStage.style.filter = `blur(${currentState.laptopBlurPx.toFixed(2)}px)`;
    laptopStage.style.transform = `translate3d(-50%, -50%, 0) scale(${currentState.laptopScale.toFixed(4)})`;
    root.dataset.laptopProgress = currentState.progress.toFixed(4);
    if (currentState.videoShouldReset && playCycleStarted) resetVideo();
    if (currentState.videoShouldPlay) beginVideoCycle();
  }

  function updateFallbackScroll() {
    fallbackFrame = 0;
    const rect = root.getBoundingClientRect();
    const travel = Math.max(1, root.offsetHeight - window.innerHeight);
    applyProgress(-rect.top / travel);
  }

  function requestFallbackScrollUpdate() {
    if (!fallbackFrame) fallbackFrame = window.requestAnimationFrame(updateFallbackScroll);
  }

  const visibilityObserver = new IntersectionObserver(entries => {
    sectionIsVisible = entries.some(entry => entry.isIntersecting);
    if (!sectionIsVisible) video.pause();
    else if (currentState.videoShouldPlay) {
      if (playCycleStarted) resumeVideo();
      else beginVideoCycle();
    }
  }, { threshold: 0.01 });

  function handleDocumentVisibility() {
    if (document.hidden) {
      video.pause();
    } else if (sectionIsVisible && currentState.videoShouldPlay) {
      if (playCycleStarted) resumeVideo();
      else beginVideoCycle();
    }
  }

  const handleMetadata = () => { if (resetOnMetadata) setVideoToStart(); };
  const handleVideoReady = () => laptopStage.classList.add('is-video-ready');
  const handleVideoError = () => root.classList.add('has-video-error');
  const handleImageError = () => {
    laptopImageHasError = true;
    root.classList.add('has-laptop-image-error');
    root.closest('.product-overview')?.classList.add('has-laptop-image-error');
    root.dataset.laptopImageError = 'true';
    applyProgress(currentState.progress);
  };
  video.addEventListener('loadedmetadata', handleMetadata);
  video.addEventListener('loadeddata', handleVideoReady);
  video.addEventListener('error', handleVideoError);
  laptopImage.addEventListener('error', handleImageError);
  document.addEventListener('visibilitychange', handleDocumentVisibility);
  if (video.readyState >= 2) handleVideoReady();
  if (laptopImage.complete && laptopImage.naturalWidth === 0) handleImageError();
  visibilityObserver.observe(root);

  if (controlled) {
    applyProgress(0);
  } else if (reduceMotion) {
    applyProgress(1);
  } else if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    const scrollState = { progress: 0 };
    scrollTween = window.gsap.to(scrollState, {
      progress: 1,
      ease: 'none',
      scrollTrigger: {
        id: 'product-laptop-handoff',
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.7,
        invalidateOnRefresh: true
      },
      onUpdate: () => applyProgress(scrollState.progress)
    });
  } else {
    window.addEventListener('scroll', requestFallbackScrollUpdate, { passive: true });
    updateFallbackScroll();
  }

  function destroy() {
    scrollTween?.kill();
    visibilityObserver.disconnect();
    window.removeEventListener('scroll', requestFallbackScrollUpdate);
    if (fallbackFrame) window.cancelAnimationFrame(fallbackFrame);
    video.removeEventListener('loadedmetadata', handleMetadata);
    video.removeEventListener('loadeddata', handleVideoReady);
    video.removeEventListener('error', handleVideoError);
    laptopImage.removeEventListener('error', handleImageError);
    document.removeEventListener('visibilitychange', handleDocumentVisibility);
    video.pause();
  }

  applyProgress(0);
  return { applyProgress, resetVideo, destroy };
}

const productLaptopHandoff = document.getElementById('product-laptop-handoff');
if (productLaptopHandoff && !productLaptopHandoff.closest('#product-overview')) {
  window.__pixoLaptopHandoff = initLaptopHandoffInteraction(productLaptopHandoff);
  window.__pixoLaptopHandoffReady = Promise.resolve(window.__pixoLaptopHandoff);
}
