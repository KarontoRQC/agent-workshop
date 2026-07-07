import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/ParticleField.tsx', 'utf8');

assert.match(
  source,
  /const GRAPH_ROUTE_YAW_LIMIT = 0\.24;/,
  'Route graph yaw must stay visibly animated while still bounded inside the viewport.',
);
assert.match(
  source,
  /const GRAPH_AGENT_YAW_LIMIT = 0\.28;/,
  'Agent graph yaw must stay visibly animated while still bounded inside the viewport.',
);
assert.match(
  source,
  /const GRAPH_LAYER_PARALLAX_YAW = 0\.26;/,
  'Graph layer parallax must stay smaller than the actual path yaw so narrow screens do not flatten the route.',
);
assert.doesNotMatch(
  source,
  /const innerDiamondSpin = elapsed \* INNER_DIAMOND_SPIN_SPEED;/,
  'Graph mode must not use unrestricted inner-diamond rotation.',
);
assert.match(
  source,
  /const graphSpinContainment = smoothstep\(0\.04, 0\.28, graphProgress\);[\s\S]*?Math\.sin\(elapsed \* \(activeIsAgentOrbitFocus \? 0\.42 : 0\.36\)\)[\s\S]*?const innerDiamondSpin = elapsed \* INNER_DIAMOND_SPIN_SPEED \* \(1 - graphSpinContainment\) \+ containedGraphYaw \* graphSpinContainment;/,
  'Graph mode must blend into bounded yaw before the diamond path can turn edge-on.',
);
assert.match(
  source,
  /const visibleSceneSpinTarget = graphTargetProgress > 0 \? containedGraphYaw \* GRAPH_LAYER_PARALLAX_YAW : sceneSpin;[\s\S]*?visibleSceneSpin = lerpAngle\(visibleSceneSpin, visibleSceneSpinTarget, graphTargetProgress > 0 \? 0\.18 : 0\.08\);[\s\S]*?points\.rotation\.y = visibleSceneSpin;/,
  'Graph mode particle layer must ease into bounded parallax instead of inheriting full background spin.',
);
assert.match(
  source,
  /Math\.sin\(elapsed \* \(activeIsAgentOrbitFocus \? 0\.36 : 0\.3\)\) \*[\s\S]*?\(activeIsAgentOrbitFocus \? GRAPH_AGENT_YAW_LIMIT : GRAPH_ROUTE_YAW_LIMIT\) \*[\s\S]*?GRAPH_LAYER_PARALLAX_YAW/,
  'Lock graph layer must use reduced parallax yaw instead of adding a second full yaw.',
);
assert.match(
  source,
  /lockLines\.rotation\.y = graphLayerSpin;\s+lockPoints\.rotation\.y = graphLayerSpin;/,
  'Lock graph layer must not inherit the full background starfield spin.',
);
assert.match(
  source,
  /const graphScale = \(width < 720 \? \(activeIsAgentOrbitFocus \? 2\.22 : 2\.02\) : activeIsAgentOrbitFocus \? 2\.56 : 2\.38\) \* STAR_SCALE_BOOST;/,
  'Activated graph particle scale must stay inside the cockpit viewport.',
);
assert.match(
  source,
  /const focusLayerScale = \(width < 720 \? 1\.16 : 1\.3\) \* STAR_SCALE_BOOST;/,
  'Focused graph layer scale must remain contained.',
);
assert.match(
  source,
  /const cameraZ = 6\.72 - graphBlend \* \(activeIsAgentOrbitFocus \? \(width < 720 \? 1\.06 : 1\.34\) : width < 720 \? 0\.72 : 0\.88\);/,
  'Graph camera must not push in far enough to crop the path.',
);
assert.match(
  source,
  /const labelBounds = label\.getBoundingClientRect\(\);[\s\S]*?const minScreenX = Math\.min\(hostWidth \/ 2, labelSafePadding \+ labelWidth \/ 2\);[\s\S]*?const screenX = clamp\(\(labelProjection\.x \* 0\.5 \+ 0\.5\) \* hostWidth, minScreenX, maxScreenX\);/,
  'Graph labels must clamp by their rendered width, not only by their projected center point.',
);
assert.match(
  source,
  /camera\.fov \+= \(\(48 - graphBlend \* \(activeIsAgentOrbitFocus \? 8\.4 : 4\.8\)\) - camera\.fov\) \* 0\.04;/,
  'Graph camera field of view must stay wide enough to keep nodes visible.',
);

console.log('Particle graph containment verified.');
