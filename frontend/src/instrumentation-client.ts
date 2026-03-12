import * as Sentry from "@sentry/nextjs";
import { getSentryBrowserConfig } from "@/lib/sentry";

Sentry.init(getSentryBrowserConfig());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
