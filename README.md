###### — @zhaoworks/fetch

An elegant fetch wrapper inspired by [`axios`](https://github.com/axios/axios) and Rust's [Result](https://doc.rust-lang.org/std/result/enum.Result.html).

#### Features

- ✅ Designed to work well with [**TanStack Query**](https://github.com/TanStack/query)
- ✅ Response validation with [**StandardSchema**](https://github.com/standard-schema/standard-schema) (Zod, Arktype, ...)  
- ✅ Typed HTTP responses & error union (`HttpResult<T>`)
- ✅ Response headers available in every `HttpResult<T>` (`result.headers`)
- ✅ Built-in timeout and abort controller
- ✅ Supports `FormData`, URL query (`?query`) and parameters (`/:id`)
- ✅ Minimal plugin system (`onRequest`, `onResponse`) for modular extensions

#### Installation

```bash
bun add @zhaoworks/fetch
```

## Usage

```ts
import { HttpClient } from '@zhaoworks/fetch';

export const http = new HttpClient({
  endpoint: 'https://api.example.com',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
});

const result = await http.get<{ name: string; }>('/users/:id', {
  params: { id: '123' },
});

if (!result.success) {
  return console.error(result.error.message);
}

const requestId = result.headers.get('x-request-id');
console.log(result.data.name, requestId);
```

## Plugin System

The plugin system is intentionally small and composable:

- `onRequest(context)` runs before `fetch`
- `onResponse(context)` runs after response parsing
- Plugins run in the order they are provided
- `context.state` is shared between request/response hooks for per-request plugin state
- `onResponse` can return a new `HttpResult<T>` to transform/override output

### Plugin API

```ts
import type {
  HttpPlugin,
  HttpPluginState,
  HttpRequestContext,
  HttpResponseContext,
  HttpResult,
} from '@zhaoworks/fetch';
```

```ts
export type HttpPluginState = Record<string, unknown>;

export interface HttpPlugin {
  name?: string;
  onRequest?: <T>(context: HttpRequestContext<T>) => void | Promise<void>;
  onResponse?: <T>(
    context: HttpResponseContext<T>
  ) => HttpResult<T> | void | Promise<HttpResult<T> | void>;
}
```

### Example 1: Auth Header Plugin

```ts
import { HttpClient } from '@zhaoworks/fetch';

const authPlugin = {
  name: 'auth',
  onRequest({ headers }) {
    headers.set('Authorization', `Bearer ${getToken()}`);
  },
};

const http = new HttpClient({
  endpoint: 'https://api.example.com',
  plugins: [authPlugin],
});
```

### Example 2: Request Timing Plugin (using plugin state)

```ts
const timingPlugin = {
  name: 'timing',
  onRequest({ state }) {
    state.startedAt = performance.now();
  },
  onResponse({ request }) {
    const startedAt = request.state.startedAt;
    if (typeof startedAt === 'number') {
      console.log(
        `[fetch] ${request.method} ${request.url} took ${Math.round(performance.now() - startedAt)}ms`
      );
    }
  },
};
```

### Example 3: Plugin Factory (function that builds a plugin)

```ts
type RetryMessagePluginOptions = {
  message: string;
};

function createRetryMessagePlugin(options: RetryMessagePluginOptions) {
  return {
    name: 'retry-message',
    onResponse({ result }) {
      if (!result.success && result.error.type === 'timeout') {
        return {
          success: false,
          headers: result.headers,
          error: {
            ...result.error,
            message: options.message,
          },
        };
      }
    },
  };
}

const retryMessagePlugin = createRetryMessagePlugin({
  message: 'Request timed out — try again in a few seconds.',
});
```

### Composition

```ts
const http = new HttpClient({
  endpoint: 'https://api.example.com',
  plugins: [authPlugin, timingPlugin, retryMessagePlugin],
});
```

### License

[MIT](/LICENSE)
