import { getAgentCombinationEntryUrl } from '../../lib/agentLaunchCatalog';
export { shouldReserveHeroHallLaunch } from './heroHallLaunchIntent';

export type HeroHallLaunchReservation = Window;

export function reserveHeroHallLaunch(): HeroHallLaunchReservation | null {
  const tab = window.open(getPendingHeroHallUrl(), '_blank');

  if (!tab) {
    return null;
  }

  try {
    tab.opener = null;
  } catch {
    // The page is same-origin; losing opener isolation is non-fatal here.
  }

  return tab;
}

export function navigateHeroHallReservation(reservation: HeroHallLaunchReservation | null, recommendationId: string) {
  if (!reservation || reservation.closed) {
    return false;
  }

  try {
    reservation.location.replace(getAgentCombinationEntryUrl(recommendationId));
    return true;
  } catch {
    closeHeroHallReservation(reservation);
    return false;
  }
}

export function closeHeroHallReservation(reservation: HeroHallLaunchReservation | null) {
  if (!reservation || reservation.closed) {
    return;
  }

  try {
    reservation.close();
  } catch {
    // A browser may revoke the WindowProxy after navigation; cleanup is best effort.
  }
}

export function isPendingHeroHallUrl(url: string) {
  try {
    const searchParams = new URL(url).searchParams;
    return searchParams.get('agent_combination') === '1' && searchParams.get('pending') === '1';
  } catch {
    return false;
  }
}

function getPendingHeroHallUrl() {
  const url = new URL(window.location.href);
  url.search = '?agent_combination=1&pending=1';
  url.hash = '';
  return url.toString();
}
