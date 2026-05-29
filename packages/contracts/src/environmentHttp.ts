import * as Context from "effect/Context";
import type * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import {
  AuthAccessTokenResult,
  AuthBrowserSessionRequest,
  AuthBrowserSessionResult,
  AuthClientSession,
  AuthCreatePairingCredentialInput,
  AuthPairingCredentialResult,
  AuthPairingLink,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
  type AuthEnvironmentScope,
  AuthTokenExchangeRequest,
  AuthSessionState,
  AuthWebSocketTicketResult,
  ServerAuthSessionMethod,
} from "./auth.ts";
import { AuthSessionId } from "./baseSchemas.ts";
import { ExecutionEnvironmentDescriptor } from "./environment.ts";
import {
  ClientOrchestrationCommand,
  DispatchResult,
  OrchestrationReadModel,
} from "./orchestration.ts";
import {
  RelayCloudEnvironmentHealthRequest,
  RelayCloudMintCredentialRequest,
  RelayEnvironmentConfigRequest,
  RelayEnvironmentHealthResponse,
  RelayEnvironmentLinkProof,
  RelayEnvironmentMintResponse,
  RelayLinkProofRequest,
} from "./relay.ts";

const OptionalBearerHeaders = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
  dpop: Schema.optionalKey(Schema.String),
});

const OptionalDpopProofHeaders = Schema.Struct({
  dpop: Schema.optionalKey(Schema.String),
});

export class EnvironmentHttpBadRequestError extends Schema.TaggedErrorClass<EnvironmentHttpBadRequestError>()(
  "EnvironmentHttpBadRequestError",
  {
    message: Schema.String,
  },
) {}

export class EnvironmentHttpUnauthorizedError extends Schema.TaggedErrorClass<EnvironmentHttpUnauthorizedError>()(
  "EnvironmentHttpUnauthorizedError",
  {
    message: Schema.String,
  },
) {}

export class EnvironmentHttpForbiddenError extends Schema.TaggedErrorClass<EnvironmentHttpForbiddenError>()(
  "EnvironmentHttpForbiddenError",
  {
    message: Schema.String,
  },
) {}

export class EnvironmentHttpInternalServerError extends Schema.TaggedErrorClass<EnvironmentHttpInternalServerError>()(
  "EnvironmentHttpInternalServerError",
  {
    message: Schema.String,
  },
) {}

export const EnvironmentHttpCommonError = Schema.Union([
  EnvironmentHttpBadRequestError,
  EnvironmentHttpUnauthorizedError,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpInternalServerError,
]);
export type EnvironmentHttpCommonError = typeof EnvironmentHttpCommonError.Type;

export class EnvironmentHttpConflictError extends Schema.TaggedErrorClass<EnvironmentHttpConflictError>()(
  "EnvironmentHttpConflictError",
  {
    message: Schema.String,
  },
) {}

export class EnvironmentCloudEndpointUnavailableError extends Schema.TaggedErrorClass<EnvironmentCloudEndpointUnavailableError>()(
  "EnvironmentCloudEndpointUnavailableError",
  {
    message: Schema.String,
    endpointRuntimeStatus: Schema.Unknown,
  },
) {}

const EnvironmentHttpBadRequestErrorResponse = EnvironmentHttpBadRequestError.pipe(
  HttpApiSchema.status("BadRequest"),
);
const EnvironmentHttpUnauthorizedErrorResponse = EnvironmentHttpUnauthorizedError.pipe(
  HttpApiSchema.status("Unauthorized"),
);
const EnvironmentHttpForbiddenErrorResponse = EnvironmentHttpForbiddenError.pipe(
  HttpApiSchema.status("Forbidden"),
);
const EnvironmentHttpInternalServerErrorResponse = EnvironmentHttpInternalServerError.pipe(
  HttpApiSchema.status("InternalServerError"),
);
const EnvironmentHttpConflictErrorResponse = EnvironmentHttpConflictError.pipe(
  HttpApiSchema.status("Conflict"),
);
const EnvironmentCloudEndpointUnavailableErrorResponse =
  EnvironmentCloudEndpointUnavailableError.pipe(HttpApiSchema.status("ServiceUnavailable"));

const EnvironmentHttpAuthErrors = [
  EnvironmentHttpBadRequestErrorResponse,
  EnvironmentHttpUnauthorizedErrorResponse,
  EnvironmentHttpForbiddenErrorResponse,
  EnvironmentHttpInternalServerErrorResponse,
] as const;

const EnvironmentHttpOrchestrationErrors = [
  EnvironmentHttpBadRequestErrorResponse,
  EnvironmentHttpUnauthorizedErrorResponse,
  EnvironmentHttpForbiddenErrorResponse,
  EnvironmentHttpInternalServerErrorResponse,
] as const;

export interface EnvironmentSessionPrincipalShape {
  readonly sessionId: AuthSessionId;
  readonly subject: string;
  readonly method: ServerAuthSessionMethod;
  readonly scopes: ReadonlySet<AuthEnvironmentScope>;
  readonly proofKeyThumbprint?: string;
  readonly expiresAt?: DateTime.DateTime;
}

export class EnvironmentAuthenticatedPrincipal extends Context.Service<
  EnvironmentAuthenticatedPrincipal,
  EnvironmentSessionPrincipalShape
>()("@t3tools/contracts/environmentHttp/EnvironmentAuthenticatedPrincipal") {}

export class EnvironmentAuthenticatedAuth extends HttpApiMiddleware.Service<
  EnvironmentAuthenticatedAuth,
  { provides: EnvironmentAuthenticatedPrincipal }
>()("EnvironmentAuthenticatedAuth", {
  error: EnvironmentHttpAuthErrors,
}) {}

const EnvironmentHttpCloudErrors = [
  EnvironmentHttpBadRequestErrorResponse,
  EnvironmentHttpUnauthorizedErrorResponse,
  EnvironmentHttpForbiddenErrorResponse,
  EnvironmentHttpConflictErrorResponse,
  EnvironmentHttpInternalServerErrorResponse,
] as const;

export const EnvironmentCloudRelayConfigResult = Schema.Struct({
  ok: Schema.Boolean,
  endpointRuntimeStatus: Schema.Unknown,
});
export type EnvironmentCloudRelayConfigResult = typeof EnvironmentCloudRelayConfigResult.Type;

export const EnvironmentCloudLinkStateResult = Schema.Struct({
  linked: Schema.Boolean,
  cloudUserId: Schema.NullOr(Schema.String),
  relayUrl: Schema.NullOr(Schema.String),
  relayIssuer: Schema.NullOr(Schema.String),
});
export type EnvironmentCloudLinkStateResult = typeof EnvironmentCloudLinkStateResult.Type;

export const AuthPairingLinkRevokeResult = Schema.Struct({
  revoked: Schema.Boolean,
});
export type AuthPairingLinkRevokeResult = typeof AuthPairingLinkRevokeResult.Type;

export const AuthClientSessionRevokeResult = Schema.Struct({
  revoked: Schema.Boolean,
});
export type AuthClientSessionRevokeResult = typeof AuthClientSessionRevokeResult.Type;

export const AuthOtherClientSessionsRevokeResult = Schema.Struct({
  revokedCount: Schema.Number,
});
export type AuthOtherClientSessionsRevokeResult = typeof AuthOtherClientSessionsRevokeResult.Type;

export class EnvironmentMetadataHttpApi extends HttpApiGroup.make("metadata").add(
  HttpApiEndpoint.get("descriptor", "/.well-known/t3/environment", {
    success: ExecutionEnvironmentDescriptor,
  }),
) {}

export class EnvironmentAuthHttpApi extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.get("session", "/api/auth/session", {
      headers: OptionalBearerHeaders,
      success: AuthSessionState,
      error: EnvironmentHttpAuthErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("browserSession", "/api/auth/browser-session", {
      payload: AuthBrowserSessionRequest,
      success: AuthBrowserSessionResult,
      error: EnvironmentHttpAuthErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("token", "/oauth/token", {
      headers: OptionalDpopProofHeaders,
      payload: AuthTokenExchangeRequest,
      success: AuthAccessTokenResult,
      error: EnvironmentHttpAuthErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("webSocketTicket", "/api/auth/websocket-ticket", {
      headers: OptionalBearerHeaders,
      success: AuthWebSocketTicketResult,
      error: EnvironmentHttpAuthErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("pairingCredential", "/api/auth/pairing-token", {
      headers: OptionalBearerHeaders,
      payload: AuthCreatePairingCredentialInput,
      success: AuthPairingCredentialResult,
      error: EnvironmentHttpAuthErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.get("pairingLinks", "/api/auth/pairing-links", {
      headers: OptionalBearerHeaders,
      success: Schema.Array(AuthPairingLink),
      error: EnvironmentHttpAuthErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("revokePairingLink", "/api/auth/pairing-links/revoke", {
      headers: OptionalBearerHeaders,
      payload: AuthRevokePairingLinkInput,
      success: AuthPairingLinkRevokeResult,
      error: EnvironmentHttpAuthErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.get("clients", "/api/auth/clients", {
      headers: OptionalBearerHeaders,
      success: Schema.Array(AuthClientSession),
      error: EnvironmentHttpAuthErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("revokeClient", "/api/auth/clients/revoke", {
      headers: OptionalBearerHeaders,
      payload: AuthRevokeClientSessionInput,
      success: AuthClientSessionRevokeResult,
      error: EnvironmentHttpAuthErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("revokeOtherClients", "/api/auth/clients/revoke-others", {
      headers: OptionalBearerHeaders,
      success: AuthOtherClientSessionsRevokeResult,
      error: EnvironmentHttpAuthErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  ) {}

export class EnvironmentOrchestrationHttpApi extends HttpApiGroup.make("orchestration")
  .add(
    HttpApiEndpoint.get("snapshot", "/api/orchestration/snapshot", {
      headers: OptionalBearerHeaders,
      success: OrchestrationReadModel,
      error: EnvironmentHttpOrchestrationErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("dispatch", "/api/orchestration/dispatch", {
      headers: OptionalBearerHeaders,
      payload: ClientOrchestrationCommand,
      success: DispatchResult,
      error: EnvironmentHttpOrchestrationErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  ) {}

export class EnvironmentCloudHttpApi extends HttpApiGroup.make("cloud")
  .add(
    HttpApiEndpoint.post("linkProof", "/api/cloud/link-proof", {
      headers: OptionalBearerHeaders,
      payload: RelayLinkProofRequest,
      success: RelayEnvironmentLinkProof,
      error: EnvironmentHttpCloudErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("relayConfig", "/api/cloud/relay-config", {
      headers: OptionalBearerHeaders,
      payload: RelayEnvironmentConfigRequest,
      success: EnvironmentCloudRelayConfigResult,
      error: [...EnvironmentHttpCloudErrors, EnvironmentCloudEndpointUnavailableErrorResponse],
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.get("linkState", "/api/cloud/link-state", {
      headers: OptionalBearerHeaders,
      success: EnvironmentCloudLinkStateResult,
      error: EnvironmentHttpCloudErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("unlink", "/api/cloud/unlink", {
      headers: OptionalBearerHeaders,
      success: EnvironmentCloudRelayConfigResult,
      error: EnvironmentHttpCloudErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("health", "/api/t3-cloud/health", {
      payload: RelayCloudEnvironmentHealthRequest,
      success: RelayEnvironmentHealthResponse,
      error: EnvironmentHttpCloudErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("mintCredential", "/api/cloud/mint-credential", {
      payload: RelayCloudMintCredentialRequest,
      success: RelayEnvironmentMintResponse,
      error: EnvironmentHttpCloudErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("t3MintCredential", "/api/t3-cloud/mint-credential", {
      payload: RelayCloudMintCredentialRequest,
      success: RelayEnvironmentMintResponse,
      error: EnvironmentHttpCloudErrors,
    }),
  ) {}

export class EnvironmentHttpApi extends HttpApi.make("environment")
  .add(EnvironmentMetadataHttpApi)
  .add(EnvironmentAuthHttpApi)
  .add(EnvironmentOrchestrationHttpApi)
  .add(EnvironmentCloudHttpApi) {}
