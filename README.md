###### — @zhaoworks/fetch

An elegant fetch wrapper inspired by [`axios`](https://github.com/axios/axios) and Rust's [Result](https://doc.rust-lang.org/std/result/enum.Result.html).

#### Features

- ✅ Designed to work well with [**TanStack Query**](https://github.com/TanStack/query)
- ✅ Response validation with [**StandardSchema**](https://github.com/standard-schema/standard-schema) (Zod, Arktype, ...)  
- ✅ Typed HTTP responses & error union (`HttpResult<T>`)
- ✅ Built-in timeout and abort controller
- ✅ Supports `FormData`, URL query (`?query`) and parameters (`/:id`)

#### Installation

```apache
λ bun add @zhaoworks/fetch
```

#### Usage

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

### License

[MIT](/LICENSE)