import { TicketType } from "@shared/schema";

type Technician = { isBackboneSpecialist?: boolean; isVendorSpecialist?: boolean };

const HELP_DESK_RESTRICTED_TYPES = new Set<string>([
  TicketType.HOME_MAINTENANCE,
  TicketType.INSTALLATION,
  TicketType.BACKBONE_MAINTENANCE,
]);

export function isBackboneOrVendorTech(tech?: Technician): boolean {
  if (!tech) return false;
  return Boolean(tech.isBackboneSpecialist || tech.isVendorSpecialist);
}

export function isHelpdeskManualAssignmentAllowed(ticketType: string | undefined, tech?: Technician): boolean {
  if (!tech) return false;
  if (!HELP_DESK_RESTRICTED_TYPES.has(ticketType ?? "")) return true;
  return isBackboneOrVendorTech(tech);
}

export function shouldRestrictDropdownToBackbone(ticketType: string | undefined): boolean {
  return ticketType === TicketType.BACKBONE_MAINTENANCE;
}
