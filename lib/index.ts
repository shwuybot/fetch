import type { StandardSchemaV1 } from '@standard-schema/spec';

import { isStandardSchema } from './schema';

export * as languages from './i18n'

/**
 * Represents the result of an HTTP operation, containing either success data or an error
 * @template T The type of the success data
 */
export type HttpResult<T> = { success: true; data: T } | { success: false; error: HttpError };

/**
 * Different types of errors that can occur during HTTP requests
 * @property type - The category of the error
 * @property message - Human-readable error message
 * @property errors - Validation errors from Zod (only for validation errors)
 * @property status - HTTP status code (only for response errors)
 * @property data - Additional error data from the server (only for response errors)
 */
export type HttpError =
  | { type: 'network'; message: string }
  | { type: 'timeout'; message: string }
  | { type: 'parse'; message: string }
  | { type: 'validation'; message: string; errors: readonly StandardSchemaV1.Issue[] }
  | { type: 'response'; message: string; status: number; data: unknown };

export type HttpMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | (string & {})

interface RequestDetails {
  method: HttpMethods;
  path: string;
  data?: unknown;
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean>;
}

/**
 * Configuration options for setting up an HTTP client.
 *
 * @interface HttpConfig
 * @property {string} endpoint - The base URL endpoint for all requests
 * @property {number} [timeout] - Optional default timeout in milliseconds
 * @property {Record<string, string>} [headers] - Optional default headers to include in all requests
 */
interface HttpConfig {
  endpoint: string;
  headers?: (details: RequestDetails) => Record<string, string>;
  timeout?: number;
  errors?: {
    format?: (error: HttpError) => string
  }
}

/**
 * Configuration options for individual HTTP requests.
 *
 * @interface RequestConfig
 * @template T - The expected response data type
 * @property {number} [timeout] - Optional request-specific timeout in milliseconds
 * @property {Record<string, string>} [headers] - Optional request-specific headers
 * @property {z.ZodType<T>} [schema] - Optional Zod schema for response validation
 * @property {FormData} [formData] - Optional form data to send with the request
 * @property {Record<string, string | number | boolean>} [query] - Optional query parameters
 */
interface RequestConfig<T> {
  timeout?: number;
  headers?: Record<string, string>;
  schema?: T;
  search?: Record<string, string | number | boolean>;
  params?: Record<string, string | number>;
}

/**
 * HTTP client for making API requests with type-safe error handling
 * @example
 * ```ts
 * const http = new HttpClient({
 *   endpoint: 'https://api.example.com',
 *   auth: () => `Bearer ${AuthStore.getState().token}`
 * });
 *
 * const getUser = async (id: string) => {
 *   const result = await http.get(`/users/${id}`);
 *
 *   if (!result.success) {
 *     console.error(formatHttpError(result.error));
 *     return null;
 *   }
 *
 *   return result.data;
 * };
 * ```
 */
export class HttpClient {
  private baseURL: string;
  private config: Required<Omit<HttpConfig, 'endpoint'>>;

  public constructor(config: HttpConfig) {
    this.baseURL = config.endpoint[config.endpoint.length - 1] ? config.endpoint.slice(0, config.endpoint.length - 1) : config.endpoint
    this.config = {
      headers: config.headers ?? (() => ({})),
      timeout: config.timeout ?? 30_000,
      errors: config.errors ?? {
        format: (error) => error.message
      }
    };
  }

  private createAbortController(timeout: number): AbortController {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller;
  }

  private interpolatePathParams(path: string, params: Record<string, string | number>): string {
    return path.replace(/:([a-zA-Z][a-zA-Z0-9]*)/g, (_, key) => {
      const value = params[key];
      if (value === undefined) {
        throw new Error(`Missing required path parameter: ${key}`);
      }
      return encodeURIComponent(String(value));
    });
  }

  private isExternalUrl(path: string): boolean {
    return path.startsWith('https://') || path.startsWith('http://');
  }

  private buildUrl(
    path: string,
    pathParams?: Record<string, string | number>,
    queryParams?: Record<string, string | number | boolean>
  ): string {
    const interpolatedPath = pathParams ? this.interpolatePathParams(path, pathParams) : path;
    const url = this.isExternalUrl(path) ? new URL(interpolatedPath) : new URL(`${this.baseURL}${interpolatedPath}`);

    if (queryParams) {
      for (const key in queryParams) {
        const value = queryParams[key];
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private getContentType(data: unknown): string | null {
    if (data === undefined || data === null) return null
    
    if (data instanceof FormData) return null // let browser choose multipart boundary
    if (data instanceof URLSearchParams) return 'application/x-www-form-urlencoded'
    if (data instanceof Blob) return data.type || 'application/octet-stream'

    if (typeof data === 'string') return 'text/plain'
    
    return 'application/json'
  }
  
  private formatError<T>(result: HttpResult<T>): HttpResult<T> {
    if (!result.success && this.config.errors.format) {
      result.error.message = this.config.errors.format(result.error)
    }

    return result
  }

  private async parseResponse<T>(response: Response, schema?: T): Promise<HttpResult<T>> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return this.formatError({
        success: false,
        error: {
          type: 'response',
          message: errorData?.message || errorData?.error?.message,
          status: response.status,
          data: response,
        }
      });
    }

    try {
      const contentType = response.headers.get('content-type');
      const data = contentType?.includes('application/json') ? await response.json() : await response.text();

      if (schema && isStandardSchema(schema)) {
        let result = schema['~standard'].validate(data);
        if (result instanceof Promise) result = await result

        if (result.issues) {
          return this.formatError({
            success: false,
            error: {
              type: 'validation',
              message: result.issues[0].message,
              errors: result.issues,
            },
          });
        }

        return { success: true, data: result.value as T };
      }

      return { success: true, data: data as T };
    } catch {
      return this.formatError({
        success: false,
        error: {
          type: 'parse',
          message: 'Failed to parse response',
        },
      });
    }
  }

  /**
   * Make an HTTP request
   * @template T The expected response data type
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - URL path relative to the base URL
   * @param data - Request body data
   * @param config - Additional request configuration
   * @returns A promise that resolves to an HttpResult
   */
  async request<T>(
    method: HttpMethods,
    path: string,
    data?: unknown,
    config?: RequestConfig<T>
  ): Promise<HttpResult<T>> {
    const isExternal = this.isExternalUrl(path);
    const controller = this.createAbortController(config?.timeout ?? this.config.timeout);

    const headers = new Headers();

    if (!isExternal) {
      const requestDetails: RequestDetails = {
        method,
        path,
        data,
        params: config?.params,
        query: config?.search,
      };

      const defaultHeaders = this.config.headers?.(requestDetails) || {};
      Object.entries(defaultHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    if (config?.headers) {
      Object.entries(config.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    const methodAllowsBody = method !== 'GET' && method !== 'HEAD';
    let body: string | FormData | URLSearchParams | Blob | undefined;

    if (methodAllowsBody && data !== undefined && data !== null) {
      if (data instanceof FormData) {
        body = data;
      } else if (data instanceof URLSearchParams) {
        body = data;
      } else if (data instanceof Blob) {
        body = data;
      } else if (typeof data === 'string') {
        body = data;
      } else {
        body = JSON.stringify(data);
      }
    }

    const contentType = this.getContentType(data);
    if (body !== undefined && contentType) {
      headers.set('Content-Type', contentType);
    }
    try {
      const response = await fetch(this.buildUrl(path, config?.params, config?.search), {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      return this.parseResponse<T>(response, config?.schema);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.formatError({
          success: false,
          error: { type: 'timeout', message: 'Request timed out' },
        });
      }

      return this.formatError({
        success: false,
        error: { type: 'network', message: 'Network request failed' },
      });
    }
  }

  /**
   * Make a GET request
   * @template T The expected response data type
   */
  async get<T>(
    path: string,
    config?: RequestConfig<T>
  ): Promise<HttpResult<T>> {
    return this.request<T>('GET', path, undefined, config);
  }

  /**
   * Make a POST request
   * @template T The expected response data type
   */
  async post<T>(
    path: string,
    data?: unknown,
    config?: RequestConfig<T>
  ): Promise<HttpResult<T>> {
    return this.request<T>('POST', path, data, config);
  }

  /**
   * Make a PUT request
   * @template T The expected response data type
   */
  async put<T>(
    path: string,
    data?: unknown,
    config?: RequestConfig<T>
  ): Promise<HttpResult<T>> {
    return this.request<T>('PUT', path, data, config);
  }

  /**
   * Make a DELETE request
   * @template T The expected response data type
   */
  async delete<T>(
    path: string,
    data?: unknown,
    config?: RequestConfig<T>
  ): Promise<HttpResult<T>> {
    return this.request<T>('DELETE', path, data, config);
  }

  /**
   * Make a PATCH request
   * @template T The expected response data type
   */
  async patch<T>(
    path: string,
    data?: unknown,
    config?: RequestConfig<T>
  ): Promise<HttpResult<T>> {
    return this.request<T>('PATCH', path, data, config);
  }

  /**
   * Throws an error if the response indicates failure.
   * Useful for quickly handling errors in promise chains.
   * @example
   * ```ts
   * http.get('/v1/me').then(http.unwrap)
   * ```
   */
  unwrap<T>(response: HttpResult<T>): T {
    if (!response.success) throw new Error(response.error.message)
    return response.data
  }
}
