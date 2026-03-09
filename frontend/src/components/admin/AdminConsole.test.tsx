import { describe, expect, it } from "vitest";

import { resolveMainAppHref } from "./AdminConsole";

describe("AdminConsole", () => {
  it("links non-admin users on the admin subdomain back to the main app domain", async () => {
    expect(resolveMainAppHref("https://admin.notes.dev.devtools.site/admin/")).toBe(
      "https://notes.dev.devtools.site/"
    );
  });

  it("keeps the root link on non-admin hosts", async () => {
    expect(resolveMainAppHref("https://notes.devtools.site/admin/")).toBe(
      "https://notes.devtools.site/"
    );
  });
});
