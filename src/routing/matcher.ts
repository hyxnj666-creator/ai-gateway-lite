import type { RouteRule, RouteMatch } from "../types/route.js";
import type { GatewayRequest } from "../types/gateway.js";

function fieldMatches(ruleValue: string | undefined, requestValue: string | undefined): boolean {
  if (ruleValue === undefined) return true;
  return ruleValue === requestValue;
}

function matchesRequest(match: RouteMatch, request: GatewayRequest): boolean {
  return (
    fieldMatches(match.taskType, request.taskType) &&
    fieldMatches(match.userTier, request.userTier) &&
    fieldMatches(match.feature, request.feature) &&
    fieldMatches(match.sensitivity, undefined)
  );
}

export function findMatchingRoute(
  rules: RouteRule[],
  request: GatewayRequest,
): RouteRule | undefined {
  const enabled = rules.filter((r) => r.enabled !== false);
  const sorted = [...enabled].sort((a, b) => b.priority - a.priority);
  return sorted.find((rule) => matchesRequest(rule.match, request));
}
