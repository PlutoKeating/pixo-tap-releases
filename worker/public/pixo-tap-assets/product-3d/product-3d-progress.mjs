export function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function rangeProgress(value, start, end) {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp01((value - start) / (end - start));
}

export function smoothstep(value) {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export function getHeroSceneState(value) {
  const progress = clamp01(value);
  const pushProgress = smoothstep(progress);
  return {
    progress,
    pushProgress,
    scale: 1 + 0.30 * pushProgress,
    peripheralBlurPx: 3 * pushProgress,
    copyOpacity: 1 - smoothstep(rangeProgress(progress, 0.42, 0.78)),
    focusOpacity: smoothstep(rangeProgress(progress, 0.08, 0.34)),
    vignetteOpacity: 0.10 + 0.22 * pushProgress
  };
}

function getModelX(turnProgress) {
  if (turnProgress === 0 || turnProgress === 1) return 0;
  if (turnProgress <= 0.32) {
    return -17 * smoothstep(turnProgress / 0.32);
  }
  if (turnProgress <= 0.60) {
    const crossing = smoothstep((turnProgress - 0.32) / 0.28);
    return -17 + 34 * crossing;
  }
  const returnToCenter = smoothstep((turnProgress - 0.60) / 0.40);
  return 17 * (1 - returnToCenter);
}

function getFeatureStep(progress) {
  if (progress >= 0.47 && progress < 0.60) return 0;
  if (progress >= 0.60 && progress < 0.73) return 1;
  if (progress >= 0.73 && progress < 0.88) return 2;
  return -1;
}

export function getProduct3DState(value) {
  const progress = clamp01(value);
  const focus = smoothstep(rangeProgress(progress, 0.15, 0.35));
  const morph = smoothstep(rangeProgress(progress, 0.35, 0.45));
  const turn = rangeProgress(progress, 0.45, 0.88);
  const turnLift = Math.sin(turn * Math.PI);
  const handoffProgress = smoothstep(rangeProgress(progress, 0.88, 0.96));
  const sceneReveal = smoothstep(rangeProgress(progress, 0.88, 0.98));
  const modelTakeoverOpacity = 1 - smoothstep(rangeProgress(progress, 0.96, 1));
  const headingOpacity = 1 - smoothstep(rangeProgress(progress, 0.38, 0.46));
  const chromeOpacity = 1 - smoothstep(rangeProgress(progress, 0.88, 0.94));

  return {
    progress,
    peripheralOpacity: 1 - focus,
    peripheralScale: focus === 1 ? 0.2 : 1 - 0.8 * focus,
    peripheralBlur: 18 * focus,
    hartScale: 1 + 1.2 * focus,
    hartOpacity: 1 - morph,
    hartBlur: 2.5 * Math.sin(morph * Math.PI),
    modelOpacity: morph,
    modelRotationY: Math.PI * 2 * turn,
    modelXvw: getModelX(turn),
    modelYvh: 1.5 - 1.5 * turnLift,
    modelScale: 0.98 + 0.06 * turnLift,
    featureStep: getFeatureStep(progress),
    handoffProgress,
    sceneOpacity: sceneReveal,
    sceneBlurPx: 18 * (1 - sceneReveal),
    sceneScale: 1 + 0.035 * (1 - sceneReveal),
    modelTakeoverOpacity,
    headingOpacity,
    chromeOpacity
  };
}

export function getLaptopHandoffState(value) {
  const progress = clamp01(value);
  const transitionProgress = smoothstep(rangeProgress(progress, 0.16, 0.78));

  return {
    progress,
    transitionProgress,
    sourceOpacity: 1 - transitionProgress,
    sourceBlurPx: 12 * transitionProgress,
    sourceScale: 1 + 0.024 * transitionProgress,
    laptopOpacity: transitionProgress,
    laptopBlurPx: 14 * (1 - transitionProgress),
    laptopScale: 0.976 + 0.024 * transitionProgress,
    videoShouldPlay: progress >= 0.82,
    videoShouldReset: progress < 0.72
  };
}
