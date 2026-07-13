import type { AgentStatus } from '../types';

type MechaCockpitFrameProps = {
  status: AgentStatus;
  voiceAwake: boolean;
};

type CockpitSideProps = {
  side: 'left' | 'right';
};

function CockpitSide({ side }: CockpitSideProps) {
  return (
    <div className={`mecha-cockpit-pillar mecha-cockpit-pillar-${side}`}>
      <span className="mecha-pillar-cap" />
      <span className="mecha-pillar-spine">
        <i />
        <i />
        <i />
      </span>
      <span className="mecha-pillar-beacon" />
      <span className="mecha-cheek-plate">
        <i />
        <i />
        <i />
      </span>
      <span className="mecha-pillar-hinge">
        <i />
      </span>
      <span className="mecha-pillar-fastener mecha-pillar-fastener-top" />
      <span className="mecha-pillar-fastener mecha-pillar-fastener-bottom" />
      <span className="mecha-pillar-energy-rail" />
    </div>
  );
}

export function MechaCockpitFrame({ status, voiceAwake }: MechaCockpitFrameProps) {
  const frameState = status === 'error' ? 'alert' : status === 'streaming' ? 'engaged' : voiceAwake ? 'linked' : 'standby';

  return (
    <div className="mecha-cockpit-frame" data-frame-state={frameState}>
      <div className="mecha-cockpit-crown">
        <span className="mecha-crown-wing mecha-crown-wing-left" />
        <span className="mecha-crown-wing mecha-crown-wing-right" />
        <span className="mecha-crown-socket">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="mecha-crown-energy" />
      </div>

      <CockpitSide side="left" />
      <CockpitSide side="right" />

      <div className="mecha-cockpit-chin">
        <span className="mecha-chin-wing mecha-chin-wing-left" />
        <span className="mecha-chin-wing mecha-chin-wing-right" />
        <span className="mecha-chin-core">
          <i />
          <i />
          <i />
        </span>
        <span className="mecha-chin-energy" />
      </div>

      <span className="mecha-visor-glass" />
    </div>
  );
}
