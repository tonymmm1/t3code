import {
  type AuthAccessTokenResult as AuthAccessTokenResultType,
  type AuthSessionState as AuthSessionStateType,
  type AuthWebSocketTicketResult as AuthWebSocketTicketResultType,
  type ExecutionEnvironmentDescriptor as ExecutionEnvironmentDescriptorType,
} from "@t3tools/contracts";
import {
  bootstrapRemoteBearerSession,
  fetchRemoteEnvironmentDescriptor,
  fetchRemoteSessionState,
  issueRemoteWebSocketTicket,
} from "@t3tools/client-runtime";
import { resolveLoopbackSshHttpBaseUrl } from "@t3tools/ssh/tunnel";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient } from "effect/unstable/http";

export type DesktopSshRemoteApiOperation =
  | "fetch-environment-descriptor"
  | "bootstrap-bearer-session"
  | "fetch-session-state"
  | "issue-websocket-ticket";

export class DesktopSshRemoteApiError extends Data.TaggedError("DesktopSshRemoteApiError")<{
  readonly operation: DesktopSshRemoteApiOperation;
  readonly cause: unknown;
}> {
  override get message() {
    return `SSH remote API request failed during ${this.operation}.`;
  }
}

export interface DesktopSshRemoteApiShape {
  readonly fetchEnvironmentDescriptor: (input: {
    readonly httpBaseUrl: string;
  }) => Effect.Effect<ExecutionEnvironmentDescriptorType, DesktopSshRemoteApiError>;
  readonly bootstrapBearerSession: (input: {
    readonly httpBaseUrl: string;
    readonly credential: string;
  }) => Effect.Effect<AuthAccessTokenResultType, DesktopSshRemoteApiError>;
  readonly fetchSessionState: (input: {
    readonly httpBaseUrl: string;
    readonly bearerToken: string;
  }) => Effect.Effect<AuthSessionStateType, DesktopSshRemoteApiError>;
  readonly issueWebSocketTicket: (input: {
    readonly httpBaseUrl: string;
    readonly bearerToken: string;
  }) => Effect.Effect<AuthWebSocketTicketResultType, DesktopSshRemoteApiError>;
}

export class DesktopSshRemoteApi extends Context.Service<
  DesktopSshRemoteApi,
  DesktopSshRemoteApiShape
>()("@t3tools/desktop/ssh/DesktopSshRemoteApi") {}

const mapError =
  (operation: DesktopSshRemoteApiOperation) =>
  (cause: unknown): DesktopSshRemoteApiError =>
    new DesktopSshRemoteApiError({ operation, cause });

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const provideHttpClient = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
    effect.pipe(Effect.provideService(HttpClient.HttpClient, httpClient));

  const fetchEnvironmentDescriptor = Effect.fn("desktop.sshRemoteApi.fetchEnvironmentDescriptor")(
    function* ({ httpBaseUrl }: { readonly httpBaseUrl: string }) {
      return yield* fetchRemoteEnvironmentDescriptor({
        httpBaseUrl: yield* resolveLoopbackSshHttpBaseUrl(httpBaseUrl),
      });
    },
    Effect.mapError(mapError("fetch-environment-descriptor")),
    provideHttpClient,
  );
  const bootstrapBearerSession = Effect.fn("desktop.sshRemoteApi.bootstrapBearerSession")(
    function* (input: { readonly httpBaseUrl: string; readonly credential: string }) {
      return yield* bootstrapRemoteBearerSession({
        httpBaseUrl: yield* resolveLoopbackSshHttpBaseUrl(input.httpBaseUrl),
        credential: input.credential,
      });
    },
    Effect.mapError(mapError("bootstrap-bearer-session")),
    provideHttpClient,
  );
  const fetchSessionState = Effect.fn("desktop.sshRemoteApi.fetchSessionState")(
    function* (input: { readonly httpBaseUrl: string; readonly bearerToken: string }) {
      return yield* fetchRemoteSessionState({
        httpBaseUrl: yield* resolveLoopbackSshHttpBaseUrl(input.httpBaseUrl),
        bearerToken: input.bearerToken,
      });
    },
    Effect.mapError(mapError("fetch-session-state")),
    provideHttpClient,
  );
  const issueWebSocketTicket = Effect.fn("desktop.sshRemoteApi.issueWebSocketTicket")(
    function* (input: { readonly httpBaseUrl: string; readonly bearerToken: string }) {
      return yield* issueRemoteWebSocketTicket({
        httpBaseUrl: yield* resolveLoopbackSshHttpBaseUrl(input.httpBaseUrl),
        bearerToken: input.bearerToken,
      });
    },
    Effect.mapError(mapError("issue-websocket-ticket")),
    provideHttpClient,
  );

  return DesktopSshRemoteApi.of({
    fetchEnvironmentDescriptor,
    bootstrapBearerSession,
    fetchSessionState,
    issueWebSocketTicket,
  });
});

export const layer = Layer.effect(DesktopSshRemoteApi, make);
