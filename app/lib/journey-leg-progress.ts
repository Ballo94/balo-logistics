import type { RouteJourney } from "./route-intelligence";

export type JourneyLegState = "completed" | "current" | "pending";

/** A leg ends on arrival at its destination stop, not after later handling there. */
export function journeyLegStates(journey: RouteJourney, currentCheckpointIndex: number, delivered: boolean): JourneyLegState[] {
  if (delivered) return journey.legs.map(() => "completed");
  const arrivals = journey.legs.map((leg) => journey.checkpoints.findIndex((checkpoint) => checkpoint.location.id === leg.destination.id));
  const firstIncomplete = arrivals.findIndex((arrival) => arrival < 0 || currentCheckpointIndex < arrival);
  return arrivals.map((arrival, index) => {
    if (arrival >= 0 && currentCheckpointIndex >= arrival) return "completed";
    return index === firstIncomplete ? "current" : "pending";
  });
}
