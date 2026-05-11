/**
 * Animation utilities — spring physics, ease curves, Babylon.js helpers.
 */

import {
  Animation,
  EasingFunction,
  SineEase,
  BackEase,
  ElasticEase,
} from "@babylonjs/core";

/** Standard LIMEN easing: sine in-out for smooth UI transitions. */
export function uiEase(): SineEase {
  const ease = new SineEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
  return ease;
}

/** Spring-bounce easing for widget entrance. */
export function springEase(amplitude = 0.3): BackEase {
  const ease = new BackEase(amplitude);
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
  return ease;
}

/** Elastic easing for "alive" feeling. */
export function elasticEase(oscillations = 3, springiness = 3): ElasticEase {
  const ease = new ElasticEase(oscillations, springiness);
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
  return ease;
}

/**
 * Float animation — continuous gentle bob.
 * Returns a looping y-position animation.
 */
export function floatAnimation(
  name: string,
  amplitude = 0.1,
  periodFrames = 120,
): Animation {
  const anim = new Animation(
    name,
    "position.y",
    30,
    Animation.ANIMATIONTYPE_FLOAT,
    Animation.ANIMATIONLOOPMODE_CYCLE,
  );
  anim.setKeys([
    { frame: 0, value: -amplitude },
    { frame: periodFrames / 2, value: amplitude },
    { frame: periodFrames, value: -amplitude },
  ]);
  return anim;
}

/**
 * Pulse scale animation — continuous gentle breathing.
 */
export function pulseAnimation(
  name: string,
  scale = 0.05,
  periodFrames = 90,
): Animation {
  const anim = new Animation(
    name,
    "scaling.x",
    30,
    Animation.ANIMATIONTYPE_FLOAT,
    Animation.ANIMATIONLOOPMODE_CYCLE,
  );
  anim.setEasingFunction(uiEase());
  anim.setKeys([
    { frame: 0, value: 1.0 },
    { frame: periodFrames / 2, value: 1.0 + scale },
    { frame: periodFrames, value: 1.0 },
  ]);
  return anim;
}
