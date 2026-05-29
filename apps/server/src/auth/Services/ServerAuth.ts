import type {
  AuthAccessTokenResult,
  AuthBrowserSessionResult,
  AuthClientMetadata,
  AuthClientSession,
  AuthCreatePairingCredentialInput,
  AuthEnvironmentScope,
  AuthPairingLink,
  AuthPairingCredentialResult,
  AuthSessionId,
  AuthSessionState,
  ServerAuthDescriptor,
  ServerAuthSessionMethod,
  AuthWebSocketTicketResult,
} from "@t3tools/contracts";
import {
  EnvironmentHttpBadRequestError,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpUnauthorizedError,
} from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";

export interface AuthenticatedSession {
  readonly sessionId: AuthSessionId;
  readonly subject: string;
  readonly method: ServerAuthSessionMethod;
  readonly scopes: ReadonlyArray<AuthEnvironmentScope>;
  readonly expiresAt?: DateTime.DateTime;
}

export class ServerAuthInternalError extends Data.TaggedError("ServerAuthInternalError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type ServerAuthError =
  | EnvironmentHttpBadRequestError
  | EnvironmentHttpForbiddenError
  | EnvironmentHttpUnauthorizedError
  | ServerAuthInternalError;

export interface ServerAuthShape {
  readonly getDescriptor: () => Effect.Effect<ServerAuthDescriptor>;
  readonly getSessionState: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<AuthSessionState, never>;
  readonly createBrowserSession: (
    credential: string,
    requestMetadata: AuthClientMetadata,
  ) => Effect.Effect<
    {
      readonly response: AuthBrowserSessionResult;
      readonly sessionToken: string;
    },
    ServerAuthError
  >;
  readonly exchangeBootstrapCredentialForAccessToken: (
    credential: string,
    requestedScopes: ReadonlyArray<AuthEnvironmentScope>,
    requestMetadata: AuthClientMetadata,
  ) => Effect.Effect<AuthAccessTokenResult, ServerAuthError>;
  readonly issuePairingCredential: (
    input?: AuthCreatePairingCredentialInput & {
      readonly scopes?: ReadonlyArray<AuthEnvironmentScope>;
    },
  ) => Effect.Effect<AuthPairingCredentialResult, ServerAuthError>;
  readonly listPairingLinks: () => Effect.Effect<ReadonlyArray<AuthPairingLink>, ServerAuthError>;
  readonly revokePairingLink: (id: string) => Effect.Effect<boolean, ServerAuthError>;
  readonly listClientSessions: (
    currentSessionId: AuthSessionId,
  ) => Effect.Effect<ReadonlyArray<AuthClientSession>, ServerAuthError>;
  readonly revokeClientSession: (
    currentSessionId: AuthSessionId,
    targetSessionId: AuthSessionId,
  ) => Effect.Effect<boolean, ServerAuthError>;
  readonly revokeOtherClientSessions: (
    currentSessionId: AuthSessionId,
  ) => Effect.Effect<number, ServerAuthError>;
  readonly authenticateHttpRequest: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<AuthenticatedSession, ServerAuthError>;
  readonly authenticateWebSocketUpgrade: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<AuthenticatedSession, ServerAuthError>;
  readonly issueWebSocketTicket: (
    session: Pick<AuthenticatedSession, "sessionId">,
  ) => Effect.Effect<AuthWebSocketTicketResult, ServerAuthError>;
  readonly issueStartupPairingUrl: (baseUrl: string) => Effect.Effect<string, ServerAuthError>;
}

export class ServerAuth extends Context.Service<ServerAuth, ServerAuthShape>()(
  "t3/auth/Services/ServerAuth",
) {}
