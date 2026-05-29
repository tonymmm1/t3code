import {
  AuthAccessManageScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthRelayManageScope,
  AuthReviewWriteScope,
  AuthTerminalOperateScope,
  EnvironmentHttpApi,
  EnvironmentHttpBadRequestError,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpInternalServerError,
  EnvironmentAuthenticatedAuth,
  EnvironmentAuthenticatedPrincipal,
} from "@t3tools/contracts";
import type {
  AuthBrowserSessionRequest,
  AuthCreatePairingCredentialInput,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
  AuthTokenExchangeRequest,
  AuthEnvironmentScope,
} from "@t3tools/contracts";
import { parseAllowedOAuthScope } from "@t3tools/shared/oauthScope";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Cookies from "effect/unstable/http/Cookies";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  ServerAuth,
  ServerAuthInternalError,
  type ServerAuthError,
} from "./Services/ServerAuth.ts";
import { SessionCredentialService } from "./Services/SessionCredentialService.ts";
import { deriveAuthClientMetadata } from "./utils.ts";

export const respondToAuthError = (error: ServerAuthError) =>
  Effect.gen(function* () {
    if (error._tag === "ServerAuthInternalError") {
      yield* Effect.logError("auth route failed", {
        message: error.message,
        cause: error.cause,
      });
      return HttpServerResponse.jsonUnsafe(
        new EnvironmentHttpInternalServerError({ message: error.message }),
        { status: 500 },
      );
    }
    const status =
      error._tag === "EnvironmentHttpBadRequestError"
        ? 400
        : error._tag === "EnvironmentHttpUnauthorizedError"
          ? 401
          : 403;
    return HttpServerResponse.jsonUnsafe(error, { status });
  });

export const failEnvironmentHttpInternalError = (error: ServerAuthInternalError) =>
  Effect.gen(function* () {
    yield* Effect.logError("auth route failed", {
      message: error.message,
      cause: error.cause,
    });
    return yield* new EnvironmentHttpInternalServerError({ message: error.message });
  });

export const requireEnvironmentScope = Effect.fn("environment.auth.requireScope")(function* (
  scope: AuthEnvironmentScope,
) {
  const session = yield* EnvironmentAuthenticatedPrincipal;
  if (!session.scopes.has(scope)) {
    return yield* new EnvironmentHttpForbiddenError({
      message: `The authenticated token is missing required scope: ${scope}.`,
    });
  }
  return session;
});

export const environmentAuthenticatedAuthLayer = Layer.effect(
  EnvironmentAuthenticatedAuth,
  Effect.gen(function* () {
    const serverAuth = yield* ServerAuth;
    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const session = yield* serverAuth.authenticateHttpRequest(request);
        return yield* httpEffect.pipe(
          Effect.provideService(EnvironmentAuthenticatedPrincipal, {
            ...session,
            scopes: new Set(session.scopes),
          }),
        );
      }).pipe(Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError));
  }),
);

export const authHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "auth",
  Effect.fnUntraced(function* (handlers) {
    const serverAuth = yield* ServerAuth;
    const sessions = yield* SessionCredentialService;

    const sessionHandler = Effect.fn("environment.auth.session")(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      return yield* serverAuth.getSessionState(request);
    });

    const browserSessionHandler = Effect.fn("environment.auth.browserSession")(
      function* (input: { readonly payload: AuthBrowserSessionRequest }) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const result = yield* serverAuth.createBrowserSession(
          input.payload.credential,
          deriveAuthClientMetadata({ request }),
        );
        const sessionCookies = yield* Effect.fromResult(
          Cookies.set(Cookies.empty, sessions.cookieName, result.sessionToken, {
            expires: DateTime.toDate(result.response.expiresAt),
            httpOnly: true,
            path: "/",
            sameSite: "lax",
          }),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new ServerAuthInternalError({
                message: "Failed to create browser session response.",
                cause,
              }),
          ),
        );

        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.succeed(HttpServerResponse.mergeCookies(response, sessionCookies)),
        );
        return result.response;
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    const tokenHandler = Effect.fn("environment.auth.token")(
      function* (input: { readonly payload: AuthTokenExchangeRequest }) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const requestedScopes = parseAllowedOAuthScope({
          value: input.payload.scope,
          allowedScopes: new Set<AuthEnvironmentScope>([
            AuthOrchestrationReadScope,
            AuthOrchestrationOperateScope,
            AuthTerminalOperateScope,
            AuthReviewWriteScope,
            AuthAccessManageScope,
            AuthRelayManageScope,
          ]),
        });
        if (requestedScopes === null) {
          return yield* new EnvironmentHttpBadRequestError({
            message: "Requested token scope is invalid.",
          });
        }
        return yield* serverAuth.exchangeBootstrapCredentialForAccessToken(
          input.payload.subject_token,
          requestedScopes,
          deriveAuthClientMetadata({ request }),
        );
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    const webSocketTicketHandler = Effect.fn("environment.auth.webSocketTicket")(
      function* () {
        const session = yield* EnvironmentAuthenticatedPrincipal;
        return yield* serverAuth.issueWebSocketTicket(session);
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    const pairingCredentialHandler = Effect.fn("environment.auth.pairingCredential")(
      function* (input: { readonly payload: AuthCreatePairingCredentialInput }) {
        yield* requireEnvironmentScope(AuthAccessManageScope);
        return yield* serverAuth.issuePairingCredential(input.payload);
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    const pairingLinksHandler = Effect.fn("environment.auth.pairingLinks")(
      function* () {
        yield* requireEnvironmentScope(AuthAccessManageScope);
        return yield* serverAuth.listPairingLinks();
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    const revokePairingLinkHandler = Effect.fn("environment.auth.revokePairingLink")(
      function* (input: { readonly payload: AuthRevokePairingLinkInput }) {
        yield* requireEnvironmentScope(AuthAccessManageScope);
        const revoked = yield* serverAuth.revokePairingLink(input.payload.id);
        return { revoked };
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    const clientsHandler = Effect.fn("environment.auth.clients")(
      function* () {
        const session = yield* requireEnvironmentScope(AuthAccessManageScope);
        return yield* serverAuth.listClientSessions(session.sessionId);
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    const revokeClientHandler = Effect.fn("environment.auth.revokeClient")(
      function* (input: { readonly payload: AuthRevokeClientSessionInput }) {
        const session = yield* requireEnvironmentScope(AuthAccessManageScope);
        const revoked = yield* serverAuth.revokeClientSession(
          session.sessionId,
          input.payload.sessionId,
        );
        return { revoked };
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    const revokeOtherClientsHandler = Effect.fn("environment.auth.revokeOtherClients")(
      function* () {
        const session = yield* requireEnvironmentScope(AuthAccessManageScope);
        const revokedCount = yield* serverAuth.revokeOtherClientSessions(session.sessionId);
        return { revokedCount };
      },
      Effect.catchTag("ServerAuthInternalError", failEnvironmentHttpInternalError),
    );

    return handlers
      .handle("session", sessionHandler)
      .handle("browserSession", browserSessionHandler)
      .handle("token", tokenHandler)
      .handle("webSocketTicket", webSocketTicketHandler)
      .handle("pairingCredential", pairingCredentialHandler)
      .handle("pairingLinks", pairingLinksHandler)
      .handle("revokePairingLink", revokePairingLinkHandler)
      .handle("clients", clientsHandler)
      .handle("revokeClient", revokeClientHandler)
      .handle("revokeOtherClients", revokeOtherClientsHandler);
  }),
);
