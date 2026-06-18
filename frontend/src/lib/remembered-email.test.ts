import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRememberedEmail,
  getRememberedEmail,
  rememberEmail,
} from "./remembered-email";

describe("remembered-email", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty string when nothing is stored", () => {
    expect(getRememberedEmail()).toBe("");
  });

  it("persists and retrieves the email", () => {
    rememberEmail("user@example.com");
    expect(getRememberedEmail()).toBe("user@example.com");
  });

  it("ignores empty emails", () => {
    rememberEmail("");
    expect(getRememberedEmail()).toBe("");
  });

  it("clears the stored email", () => {
    rememberEmail("user@example.com");
    clearRememberedEmail();
    expect(getRememberedEmail()).toBe("");
  });
});
