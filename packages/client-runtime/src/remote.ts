import {
  AuthAccessTokenType,
  AuthEnvironmentBootstrapTokenType,
  AuthRemoteSessionScope,
  AuthTokenExchangeGrantType,
  EnvironmentHttpApi,
  EnvironmentHttpCommonError,
} from "@t3tools/contracts";
import type {
  EnvironmentHttpBadRequestError,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpInternalServerError,
  EnvironmentHttpUnauthorizedError,
} from "@t3tools/contracts";
import { oauthScopeSetEquals } from "@t3tools/shared/oauthScope";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientError } from "effect/unstable/http";
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient";

const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS = 10_000;
const isEnvironmentHttpCommonError = Schema.is(EnvironmentHttpCommonError);

export const remoteEndpointUrl = (httpBaseUrl: string, pathname: string): string => {
  const url = new URL(httpBaseUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
};

const remoteApiBaseUrl = (httpBaseUrl: string): string => {
  const url = new URL(httpBaseUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
};

export class RemoteEnvironmentAuthFetchError extends Data.TaggedError(
  "RemoteEnvironmentAuthFetchError",
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class RemoteEnvironmentAuthInvalidJsonError extends Data.TaggedError(
  "RemoteEnvironmentAuthInvalidJsonError",
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class RemoteEnvironmentAuthUndeclaredStatusError extends Data.TaggedError(
  "RemoteEnvironmentAuthUndeclaredStatusError",
)<{
  readonly message: string;
  readonly status: number;
  readonly requestUrl: string;
}> {
  constructor(requestUrl: string, status: number) {
    super({
      message: `Remote auth endpoint ${requestUrl} returned undeclared status ${status}.`,
      requestUrl,
      status,
    });
  }
}

export class RemoteEnvironmentAuthTimeoutError extends Data.TaggedError(
  "RemoteEnvironmentAuthTimeoutError",
)<{
  readonly message: string;
  readonly requestUrl: string;
  readonly timeoutMs: number;
}> {
  constructor(requestUrl: string, timeoutMs: number) {
    super({
      message: `Remote auth endpoint ${requestUrl} timed out after ${timeoutMs}ms.`,
      requestUrl,
      timeoutMs,
    });
  }
}

export type RemoteEnvironmentAuthError =
  | EnvironmentHttpBadRequestError
  | EnvironmentHttpUnauthorizedError
  | EnvironmentHttpForbiddenError
  | EnvironmentHttpInternalServerError
  | RemoteEnvironmentAuthFetchError
  | RemoteEnvironmentAuthInvalidJsonError
  | RemoteEnvironmentAuthUndeclaredStatusError
  | RemoteEnvironmentAuthTimeoutError;

export const remoteHttpClientLayer = (
  fetchFn: typeof globalThis.fetch,
): Layer.Layer<HttpClient.HttpClient> =>
  FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchFn)));

const failRemoteRequest = (
  requestUrl: string,
  cause: unknown,
): Effect.Effect<never, RemoteEnvironmentAuthError> => {
  if (cause instanceof RemoteEnvironmentAuthTimeoutError) {
    return Effect.fail(cause);
  }
  if (isEnvironmentHttpCommonError(cause)) {
    return Effect.fail(cause);
  }
  if (Schema.isSchemaError(cause)) {
    return Effect.fail(
      new RemoteEnvironmentAuthInvalidJsonError({
        message: `Remote auth endpoint returned an invalid response from ${requestUrl}.`,
        cause,
      }),
    );
  }
  if (HttpClientError.isHttpClientError(cause) && cause.response !== undefined) {
    const response = cause.response;
    if (response.status < 200 || response.status >= 300) {
      return Effect.fail(
        new RemoteEnvironmentAuthUndeclaredStatusError(requestUrl, response.status),
      );
    }
    return Effect.fail(
      new RemoteEnvironmentAuthInvalidJsonError({
        message: `Remote auth endpoint returned an invalid response from ${requestUrl}.`,
        cause,
      }),
    );
  }
  return Effect.fail(
    new RemoteEnvironmentAuthFetchError({
      message: `Failed to fetch remote auth endpoint ${requestUrl} (${String(cause)}).`,
      cause,
    }),
  );
};

const executeRemoteRequest = <A, E, R>(
  requestUrl: string,
  timeoutMs: number,
  request: Effect.Effect<A, E, R>,
): Effect.Effect<A, RemoteEnvironmentAuthError, R> =>
  request.pipe(
    Effect.timeoutOption(Duration.millis(timeoutMs)),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new RemoteEnvironmentAuthTimeoutError(requestUrl, timeoutMs)),
        onSome: Effect.succeed,
      }),
    ),
    Effect.catch((cause) => failRemoteRequest(requestUrl, cause)),
  );

export const makeEnvironmentHttpApiClient = (httpBaseUrl: string) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    return yield* HttpApiClient.makeWith(EnvironmentHttpApi, {
      httpClient,
      baseUrl: remoteApiBaseUrl(httpBaseUrl),
    });
  });

export const exchangeRemoteDpopAccessToken = Effect.fn(
  "clientRuntime.remote.exchangeRemoteDpopAccessToken",
)(function* (input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
  readonly dpopProof: string;
  readonly timeoutMs?: number;
}) {
  const client = yield* makeEnvironmentHttpApiClient(input.httpBaseUrl);
  const response = yield* executeRemoteRequest(
    remoteEndpointUrl(input.httpBaseUrl, "/api/auth/token"),
    input.timeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS,
    client.auth.dpopToken({
      headers: { dpop: input.dpopProof },
      payload: {
        grant_type: AuthTokenExchangeGrantType,
        subject_token: input.credential,
        subject_token_type: AuthEnvironmentBootstrapTokenType,
        requested_token_type: AuthAccessTokenType,
        resource: new URL(input.httpBaseUrl).origin,
        scope: AuthRemoteSessionScope,
      },
    }),
  );
  if (!oauthScopeSetEquals(response.scope, [AuthRemoteSessionScope])) {
    return yield* new RemoteEnvironmentAuthInvalidJsonError({
      message: "Remote auth endpoint returned unexpected DPoP access token scopes.",
      cause: response.scope,
    });
  }
  return response;
});

export const bootstrapRemoteBearerSession = Effect.fn(
  "clientRuntime.remote.bootstrapRemoteBearerSession",
)(function* (input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
  readonly proofKeyThumbprint?: string;
  readonly dpopProof?: string;
  readonly timeoutMs?: number;
}) {
  const client = yield* makeEnvironmentHttpApiClient(input.httpBaseUrl);
  return yield* executeRemoteRequest(
    remoteEndpointUrl(input.httpBaseUrl, "/api/auth/bootstrap/bearer"),
    input.timeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS,
    client.auth.bootstrapBearer({
      headers: input.dpopProof ? { dpop: input.dpopProof } : {},
      payload: {
        credential: input.credential,
        ...(input.proofKeyThumbprint ? { proofKeyThumbprint: input.proofKeyThumbprint } : {}),
      },
    }),
  );
});

export const fetchRemoteSessionState = Effect.fn("clientRuntime.remote.fetchRemoteSessionState")(
  function* (input: {
    readonly httpBaseUrl: string;
    readonly bearerToken: string;
    readonly timeoutMs?: number;
  }) {
    const client = yield* makeEnvironmentHttpApiClient(input.httpBaseUrl);
    return yield* executeRemoteRequest(
      remoteEndpointUrl(input.httpBaseUrl, "/api/auth/session"),
      input.timeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS,
      client.auth.session({
        headers: {
          authorization: `Bearer ${input.bearerToken}`,
        },
      }),
    );
  },
);

export const fetchRemoteDpopSessionState = Effect.fn(
  "clientRuntime.remote.fetchRemoteDpopSessionState",
)(function* (input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly dpopProof: string;
  readonly timeoutMs?: number;
}) {
  const client = yield* makeEnvironmentHttpApiClient(input.httpBaseUrl);
  return yield* executeRemoteRequest(
    remoteEndpointUrl(input.httpBaseUrl, "/api/auth/session"),
    input.timeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS,
    client.auth.session({
      headers: {
        authorization: `DPoP ${input.accessToken}`,
        dpop: input.dpopProof,
      },
    }),
  );
});

export const fetchRemoteEnvironmentDescriptor = Effect.fn(
  "clientRuntime.remote.fetchRemoteEnvironmentDescriptor",
)(function* (input: { readonly httpBaseUrl: string; readonly timeoutMs?: number }) {
  const client = yield* makeEnvironmentHttpApiClient(input.httpBaseUrl);
  return yield* executeRemoteRequest(
    remoteEndpointUrl(input.httpBaseUrl, "/.well-known/t3/environment"),
    input.timeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS,
    client.metadata.descriptor(),
  );
});

export const issueRemoteWebSocketToken = Effect.fn(
  "clientRuntime.remote.issueRemoteWebSocketToken",
)(function* (input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
  readonly timeoutMs?: number;
}) {
  const client = yield* makeEnvironmentHttpApiClient(input.httpBaseUrl);
  return yield* executeRemoteRequest(
    remoteEndpointUrl(input.httpBaseUrl, "/api/auth/ws-token"),
    input.timeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS,
    client.auth.webSocketToken({
      headers: {
        authorization: `Bearer ${input.bearerToken}`,
      },
    }),
  );
});

export const issueRemoteDpopWebSocketToken = Effect.fn(
  "clientRuntime.remote.issueRemoteDpopWebSocketToken",
)(function* (input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly dpopProof: string;
  readonly timeoutMs?: number;
}) {
  const client = yield* makeEnvironmentHttpApiClient(input.httpBaseUrl);
  return yield* executeRemoteRequest(
    remoteEndpointUrl(input.httpBaseUrl, "/api/auth/ws-token"),
    input.timeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS,
    client.auth.webSocketToken({
      headers: {
        authorization: `DPoP ${input.accessToken}`,
        dpop: input.dpopProof,
      },
    }),
  );
});

export const resolveRemoteWebSocketConnectionUrl = Effect.fn(
  "clientRuntime.remote.resolveRemoteWebSocketConnectionUrl",
)(function* (input: {
  readonly wsBaseUrl: string;
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
  readonly timeoutMs?: number;
}) {
  const issued = yield* issueRemoteWebSocketToken({
    httpBaseUrl: input.httpBaseUrl,
    bearerToken: input.bearerToken,
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
  });

  const url = new URL(input.wsBaseUrl);
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = "/ws";
  }
  url.searchParams.set("wsToken", issued.token);
  return url.toString();
});

export const resolveRemoteDpopWebSocketConnectionUrl = Effect.fn(
  "clientRuntime.remote.resolveRemoteDpopWebSocketConnectionUrl",
)(function* (input: {
  readonly wsBaseUrl: string;
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly dpopProof: string;
  readonly timeoutMs?: number;
}) {
  const issued = yield* issueRemoteDpopWebSocketToken({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    dpopProof: input.dpopProof,
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
  });
  const url = new URL(input.wsBaseUrl);
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = "/ws";
  }
  url.searchParams.set("wsToken", issued.token);
  return url.toString();
});
