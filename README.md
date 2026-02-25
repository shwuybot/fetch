###### — @zhaoworks/fetch

An elegant fetch wrapper inspired by [`axios`](https://github.com/axios/axios) and Rust's [Result](https://doc.rust-lang.org/std/result/enum.Result.html).

#### Features

- ✅ Designed to work well with [**TanStack Query**](https://github.com/TanStack/query)
- ✅ Response validation with [**StandardSchema**](https://github.com/standard-schema/standard-schema) (Zod, Arktype, ...)  
- ✅ Typed HTTP responses & error union (`HttpResult<T>`)
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

console.log(result.data.name);
```

## Plugin System

The plugin system is intentionally small and composable:

- `onRequest(context)` runs before `fetch`
- `onResponse(context)` runs after response parsing
- Plugins run in the order they are provided
- `onResponse` can return a new `HttpResult<T>` to transform/override output

### Plugin API

```ts
import type {
  HttpPlugin,
  HttpRequestContext,
  HttpResponseContext,
  HttpResult,
} from '@zhaoworks/fetch';
```

```ts
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

### Example 2: Request Timing Plugin

```ts
const timingPlugin = {
  name: 'timing',
  onRequest(context) {
    (context as any).startedAt = performance.now();
  },
  onResponse(context) {
    const startedAt = (context.request as any).startedAt;
    if (typeof startedAt === 'number') {
      console.log(
        `[fetch] ${context.request.method} ${context.request.url} took ${Math.round(performance.now() - startedAt)}ms`
      );
    }
  },
};
```

### Example 3: Normalize API Errors

```ts
const normalizeErrorPlugin = {
  name: 'normalize-error',
  onResponse({ result }) {
    if (!result.success && result.error.type === 'response' && result.error.status === 401) {
      return {
        success: false,
        error: {
          ...result.error,
          message: 'Your session has expired. Please sign in again.',
        },
      };
    }
  },
};

const http = new HttpClient({
  endpoint: 'https://api.example.com',
  plugins: [normalizeErrorPlugin],
});
```

### Composition

```ts
const http = new HttpClient({
  endpoint: 'https://api.example.com',
  plugins: [authPlugin, timingPlugin, normalizeErrorPlugin],
});
```

### License

[MIT](/LICENSE)
