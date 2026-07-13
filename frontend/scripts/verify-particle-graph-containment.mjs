import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/ParticleField.tsx', 'utf8');

assert.match(source, /const GRAPH_LOCKED_ROTATION = 0;/, 'Graph mode must use an exact front-facing rotation lock.');
assert.match(source, /const GRAPH_DIAMOND_YAW_SPEED = 0\.18;/, 'The graph diamond must use a slow frame-rate-independent yaw speed.');
assert.match(
  source,
  /const SHELL_RADIAL_FACET_COUNT = (?:1[2-9]|[2-9]\d|\d{3,});/,
  'The graph diamond needs at least twelve radial facets so its rotating silhouette does not visibly flatten.',
);
assert.doesNotMatch(
  source,
  /GRAPH_(?:ROUTE|AGENT)_YAW|GRAPH_LAYER_PARALLAX_YAW|containedGraphYaw|containedLayerYaw/,
  'Graph mode must not retain bounded yaw or parallax rotation paths.',
);
assert.match(
  source,
  /let innerDiamondSpin = sceneSpin;/,
  'Inner-diamond rotation must use persistent frame-to-frame state.',
);
assert.match(
  source,
  /let graphDiamondYaw = 0;/,
  'Graph-diamond yaw must persist across frames instead of being recomputed from wall-clock phase.',
);
assert.match(
  source,
  /const rotationDelta = Math\.min\(rawDelta, 0\.2\);[\s\S]*?const graphRotationActive = graphTargetProgress > 0 \|\| graphProgress > 0\.015;[\s\S]*?if \(graphRotationActive\) \{\s+innerDiamondSpin = GRAPH_LOCKED_ROTATION;\s+graphDiamondYaw = wrapAngle\([\s\S]*?rotationDelta \* GRAPH_DIAMOND_YAW_SPEED \* smoothstep\(0\.12, 0\.72, graphProgress\)[\s\S]*?\);\s+\} else \{/,
  'Graph mode must lock the route layers while advancing a slow horizontal diamond yaw.',
);
assert.match(
  source,
  /innerDiamondSpin = wrapAngle\(innerDiamondSpin \+ delta \* INNER_DIAMOND_SPIN_SPEED\);/,
  'Idle rotation must advance from persistent state without accumulating an unbounded angle.',
);
assert.match(
  source,
  /if \(graphRotationActive && role === ROLE_SHELL && !hasLockedParticleTarget\) \{\s+const targetX = target\.x;\s+const targetZ = target\.z;\s+target\.x = targetX \* graphDiamondYawCos - targetZ \* graphDiamondYawSin;\s+target\.z = targetX \* graphDiamondYawSin \+ targetZ \* graphDiamondYawCos;\s+\}/,
  'Only unlocked shell particles may yaw horizontally around the Y axis during graph mode.',
);
assert.doesNotMatch(
  source,
  /target\.y = [^;]*graphDiamondYaw/,
  'Horizontal graph-diamond yaw must preserve particle height.',
);
assert.match(
  source,
  /host\.dataset\.graphDiamondRotationAxis = 'y';[\s\S]*?host\.dataset\.graphDiamondRotation = graphDiamondYaw\.toFixed\(4\);/,
  'Runtime audits need graph-diamond rotation telemetry.',
);
assert.match(
  source,
  /if \(graphRotationActive\) \{\s+visibleSceneSpin = GRAPH_LOCKED_ROTATION;\s+graphLayerSpin = GRAPH_LOCKED_ROTATION;\s+\} else \{/,
  'Particle and route layers must be hard-locked every active graph frame.',
);
assert.match(
  source,
  /points\.rotation\.x = graphRotationActive \? GRAPH_LOCKED_ROTATION :[\s\S]*?points\.rotation\.z = graphRotationActive[\s\S]*?\? GRAPH_LOCKED_ROTATION/,
  'Graph mode must lock pitch and roll in addition to yaw.',
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
  /const labelSize = lockedGraphLabelSizes\[index\];[\s\S]*?const minScreenX = Math\.min\(hostWidth \/ 2, labelSafePadding \+ labelWidth \/ 2\);[\s\S]*?const screenX = clamp\(\(labelProjection\.x \* 0\.5 \+ 0\.5\) \* hostWidth, minScreenX, maxScreenX\);/,
  'Graph labels must clamp by their rendered width, not only by their projected center point.',
);
assert.match(
  source,
  /const targetFov = 48 - graphBlend \* \(activeIsAgentOrbitFocus \? 8\.4 : 4\.8\);[\s\S]*?camera\.fov = nextFov;/,
  'Graph camera field of view must stay wide enough to keep nodes visible.',
);

console.log('Particle graph containment verified.');
