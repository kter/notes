import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  classifyChangeFailure,
  isAuthApiError,
  isConflictApiError,
} from "./changeOutcome";

describe("classifyChangeFailure", () => {
  it("classifies 409 as a conflict", () => {
    const error = new ApiError(409, "Conflict", { detail: "stale version" });

    expect(classifyChangeFailure(error)).toEqual({ kind: "conflict" });
  });

  it("classifies 401 as an expired session", () => {
    const error = new ApiError(401, "Unauthorized", { detail: "expired" });

    expect(classifyChangeFailure(error)).toEqual({ kind: "sessionExpired" });
  });

  it.each([500, 502, 503, 429, 400, 403])(
    "classifies %i as retryable and keeps the original error",
    (status) => {
      const error = new ApiError(status, "Boom", { detail: "x" });

      expect(classifyChangeFailure(error)).toEqual({ kind: "retryable", error });
    }
  );

  it("classifies a network error as retryable", () => {
    const error = new TypeError("Failed to fetch");

    expect(classifyChangeFailure(error)).toEqual({ kind: "retryable", error });
  });

  it("classifies a non-Error value as retryable", () => {
    expect(classifyChangeFailure("boom")).toEqual({ kind: "retryable", error: "boom" });
  });
});

describe("predicates", () => {
  it("narrows only on the matching status", () => {
    expect(isConflictApiError(new ApiError(409, "c", {}))).toBe(true);
    expect(isConflictApiError(new ApiError(401, "a", {}))).toBe(false);
    expect(isAuthApiError(new ApiError(401, "a", {}))).toBe(true);
    expect(isAuthApiError(new ApiError(409, "c", {}))).toBe(false);
  });

  it("rejects values that are not ApiError", () => {
    expect(isConflictApiError({ status: 409 })).toBe(false);
    expect(isAuthApiError({ status: 401 })).toBe(false);
  });
});
