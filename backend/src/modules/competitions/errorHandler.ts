import {
  CompetitionNotFoundError,
  UnauthorizedCompetitionError,
  CompetitionAlreadyStartedError,
  UserAlreadyJoinedError,
  InvalidJoinCodeError,
} from "../../domain/competitions/types";

export function handleCompetitionError(error: Error, ctx: any) {
  if (error instanceof CompetitionNotFoundError) {
    ctx.set.status = 404;
    return { error: error.message };
  }
  if (error instanceof UnauthorizedCompetitionError) {
    ctx.set.status = 403;
    return { error: error.message };
  }
  if (error instanceof CompetitionAlreadyStartedError) {
    ctx.set.status = 400;
    return { error: error.message };
  }
  if (error instanceof UserAlreadyJoinedError) {
    return { ok: true, alreadyJoined: true };
  }
  if (error instanceof InvalidJoinCodeError) {
    ctx.set.status = 404;
    return { error: error.message };
  }

  if (
    error.message === "User not found" ||
    error.message === "Missing bearer token" ||
    error.message === "Invalid token" ||
    error.message.startsWith("Session expired")
  ) {
    ctx.set.status = 401;
    return { error: "Unauthorized: " + error.message };
  }

  ctx.set.status = 500;
  console.error("[Competitions] Unhandled error:", error);
  return { error: "Internal server error" };
}
